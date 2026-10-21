import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { db as database } from "@iam/db";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const TEST_DATABASE_URL_ENV = "IAM_API_TEST_DATABASE_URL";
const RESERVED_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);

export interface ApiPostgresTestHarness {
  readonly databaseUrl: string;
  readonly db: typeof database;
  readonly sql: ReturnType<typeof postgres>;
  readonly reset: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export async function createApiPostgresTestHarness(
  trackStop?: (close: () => Promise<void>) => void,
): Promise<ApiPostgresTestHarness> {
  const databaseUrl = requireDedicatedTestDatabaseUrl();
  const schemaName = `iam_api_${randomUUID().replaceAll("-", "")}`;
  const adminSql = postgres(databaseUrl, { max: 1 });
  let scopedSql: ReturnType<typeof postgres> | undefined;
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      const failures: unknown[] = [];
      for (const cleanup of [
        () => scopedSql?.end({ timeout: 1 }),
        () => adminSql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`),
        () => adminSql.end({ timeout: 1 }),
      ]) {
        try {
          await cleanup();
        } catch (failure) {
          failures.push(failure);
        }
      }
      if (failures.length) throw new AggregateError(failures, "API PostgreSQL fixture cleanup failed");
    })());

  try {
    trackStop?.(close);
    await adminSql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    if (closing) throw new Error("API PostgreSQL fixture stopped during initialization");
    scopedSql = postgres(databaseUrl, {
      connection: {
        application_name: `iam-api-contract-${schemaName}`,
        search_path: schemaName,
      },
      max: 6,
    });
    const db = drizzle({ client: scopedSql, relations });
    const migrationsFolder = fileURLToPath(new URL("../../../../packages/db/src/migrations", import.meta.url));
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });
    if (closing) throw new Error("API PostgreSQL fixture stopped during initialization");

    const scopedUrl = new URL(databaseUrl);
    scopedUrl.searchParams.set("search_path", schemaName);
    return {
      databaseUrl: scopedUrl.href,
      db,
      sql: scopedSql,
      async reset() {
        await scopedSql!.unsafe(
          `TRUNCATE TABLE
            organization_search_change,
            organization_search_dirty,
            organization_search_document,
            audit_log,
            client_delegation,
            client,
            organization_closure,
            organization,
            privilege,
            employment,
            "user"
          RESTART IDENTITY CASCADE`,
        );
      },
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "API PostgreSQL fixture setup and cleanup failed");
    }
    throw error;
  }
}

function requireDedicatedTestDatabaseUrl() {
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

  for (const developmentEnv of ["DATABASE_URL", "IAM_API_DATABASE_URL"] as const) {
    const developmentUrl = process.env[developmentEnv];
    if (developmentUrl && databaseIdentity(developmentUrl) === databaseIdentity(databaseUrl)) {
      throw new Error(`${TEST_DATABASE_URL_ENV} must not identify the same database as ${developmentEnv}`);
    }
  }

  return databaseUrl;
}

function databaseIdentity(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || "5432";
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  return `${host}:${port}/${databaseName}`;
}

function quoteIdentifier(identifier: string) {
  if (!/^[a-z0-9_]+$/u.test(identifier)) throw new Error("test schema name contains unsafe characters");
  return `"${identifier}"`;
}
