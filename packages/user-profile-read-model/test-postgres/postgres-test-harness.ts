import type { db as database, DbClient } from "@iam/db";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const TEST_DATABASE_URL_ENV = "IAM_USER_PROFILE_TEST_DATABASE_URL";
const RESERVED_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);

export interface HeldDirtyRowLock {
  readonly commit: (nextState?: {
    dirtyVersion: string;
    status: string;
  }) => Promise<void>;
}

export interface PostgresTestHarness {
  readonly db: DbClient;
  readonly sql: ReturnType<typeof postgres>;
  readonly reset: () => Promise<void>;
  readonly holdDirtyRowLock: (userId: number) => Promise<HeldDirtyRowLock>;
  readonly waitForScopedClientLock: () => Promise<void>;
  readonly waitForPublicationToBlock: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface CreatePostgresTestHarnessOptions {
  readonly createDatabase?: (
    client: ReturnType<typeof postgres>,
  ) => typeof database;
  readonly createSql?: typeof postgres;
  readonly runMigrations?: typeof migrate;
}

export async function createPostgresTestHarness(
  options: CreatePostgresTestHarnessOptions = {},
): Promise<PostgresTestHarness> {
  const databaseUrl = requireDedicatedTestDatabaseUrl();
  const createDatabase = options.createDatabase
    ?? (client => drizzle({ client, relations }));
  const createSql = options.createSql ?? postgres;
  const runMigrations = options.runMigrations ?? migrate;
  const runId = randomUUID().replaceAll("-", "");
  const schemaName = `iam_user_profile_${runId}`;
  const publicationApplicationName = `iam-user-profile-publication-${runId}`;
  const adminSql = createSql(databaseUrl, { max: 1 });
  let scopedSql: ReturnType<typeof postgres> | undefined;
  let blockerSql: ReturnType<typeof postgres> | undefined;
  let schemaCreated = false;

  try {
    await adminSql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    schemaCreated = true;
    scopedSql = createSql(databaseUrl, {
      connection: {
        application_name: publicationApplicationName,
        search_path: schemaName,
      },
      max: 4,
    });
    blockerSql = createSql(databaseUrl, {
      connection: {
        application_name: `${publicationApplicationName}-blocker`,
        search_path: schemaName,
      },
      max: 1,
    });
    const db = createDatabase(scopedSql);
    const migrationsFolder = fileURLToPath(new URL("../../db/src/migrations", import.meta.url));
    await runMigrations(db, { migrationsFolder, migrationsSchema: schemaName });
    const waitForScopedClientLock = async () => {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const rows = await adminSql<{ blocked: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE application_name = ${publicationApplicationName}
              AND wait_event_type = 'Lock'
          ) AS blocked
        `;
        if (rows[0]?.blocked === true)
          return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error("scoped PostgreSQL client did not block on a row lock");
    };

    return {
      db,
      sql: scopedSql,
      async reset() {
        await scopedSql!.unsafe(
          "TRUNCATE TABLE subject_access_transition, user_profile_dirty, user_profile, \"user\" RESTART IDENTITY CASCADE",
        );
      },
      async holdDirtyRowLock(userId) {
        let releaseTransaction!: () => void;
        let resolveLocked!: () => void;
        let rejectLocked!: (error: unknown) => void;
        let nextState: { dirtyVersion: string; status: string } | undefined;
        let committed = false;
        const releaseGate = new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });
        const locked = new Promise<void>((resolve, reject) => {
          resolveLocked = resolve;
          rejectLocked = reject;
        });
        const transaction = blockerSql!.begin(async (tx) => {
          try {
            await tx`SELECT user_id FROM user_profile_dirty WHERE user_id = ${userId} FOR UPDATE`;
            resolveLocked();
            await releaseGate;
            if (nextState !== undefined) {
              await tx`
                UPDATE user_profile_dirty
                SET dirty_version = ${nextState.dirtyVersion},
                    status = ${nextState.status},
                    update_time = NOW()
                WHERE user_id = ${userId}
              `;
            }
          }
          catch (error) {
            rejectLocked(error);
            throw error;
          }
        });

        await locked;
        return {
          async commit(state) {
            if (committed)
              return;
            committed = true;
            nextState = state;
            releaseTransaction();
            await transaction;
          },
        };
      },
      waitForPublicationToBlock: waitForScopedClientLock,
      waitForScopedClientLock,
      async close() {
        await runWithOwnedTestResources(async ({ registerCleanup }) => {
          registerCleanup(async () => await adminSql.end());
          registerCleanup(async () => {
            await adminSql.unsafe(
              `DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`,
            );
          });
          registerCleanup(async () => await blockerSql!.end());
          registerCleanup(async () => await scopedSql!.end());
        });
      },
    };
  }
  catch (error) {
    return await runWithOwnedTestResources<PostgresTestHarness>(async ({ registerCleanup }) => {
      registerCleanup(async () => await adminSql.end({ timeout: 1 }));
      if (schemaCreated) {
        registerCleanup(async () => {
          await adminSql.unsafe(
            `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`,
          );
        });
      }
      const blockerToClose = blockerSql;
      if (blockerToClose)
        registerCleanup(async () => await blockerToClose.end({ timeout: 1 }));
      const scopedToClose = scopedSql;
      if (scopedToClose)
        registerCleanup(async () => await scopedToClose.end({ timeout: 1 }));
      throw error;
    });
  }
}

function requireDedicatedTestDatabaseUrl(): string {
  const databaseUrl = process.env[TEST_DATABASE_URL_ENV];
  if (!databaseUrl) {
    throw new Error(
      `${TEST_DATABASE_URL_ENV} must point to a dedicated PostgreSQL test database; no fallback is allowed`,
    );
  }

  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    throw new Error(`${TEST_DATABASE_URL_ENV} must use the postgres or postgresql protocol`);

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName || RESERVED_DATABASE_NAMES.has(databaseName.toLowerCase())) {
    throw new Error(`${TEST_DATABASE_URL_ENV} must name a dedicated, non-system test database`);
  }

  const developmentUrl = process.env.DATABASE_URL;
  if (developmentUrl && databaseIdentity(developmentUrl) === databaseIdentity(databaseUrl)) {
    throw new Error(`${TEST_DATABASE_URL_ENV} must not identify the same database as DATABASE_URL`);
  }

  return databaseUrl;
}

function databaseIdentity(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || "5432";
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  return `${host}:${port}/${databaseName}`;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z0-9_]+$/u.test(identifier))
    throw new Error("test schema name contains unsafe characters");
  return `"${identifier}"`;
}
