import type { DbClient } from "@iam/db";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const TEST_DATABASE_URL_ENV = "IAM_ORGANIZATION_RESPONSIBILITY_TEST_DATABASE_URL";
const RESERVED_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);

export interface PostgresTestHarness {
  readonly db: DbClient;
  readonly reset: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export async function createPostgresTestHarness(): Promise<PostgresTestHarness> {
  const databaseUrl = requireDedicatedTestDatabaseUrl();
  const schemaName = `iam_org_responsibility_${randomUUID().replaceAll("-", "")}`;
  const adminSql = postgres(databaseUrl, { max: 1 });
  let scopedSql: ReturnType<typeof postgres> | undefined;

  try {
    await adminSql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    scopedSql = postgres(databaseUrl, {
      connection: { search_path: schemaName },
      max: 1,
    });
    const db = drizzle({ client: scopedSql, relations });
    const migrationsFolder = fileURLToPath(new URL("../../../db/src/migrations", import.meta.url));
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });

    return {
      db,
      async reset() {
        await scopedSql!.unsafe([
          "TRUNCATE TABLE organization_responsibility_assignment, organization_closure,",
          "employment, organization RESTART IDENTITY CASCADE",
        ].join(" "));
      },
      async close() {
        await scopedSql!.end();
        await adminSql.unsafe(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
        await adminSql.end();
      },
    };
  }
  catch (error) {
    if (scopedSql)
      await scopedSql.end({ timeout: 1 });
    await adminSql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    await adminSql.end({ timeout: 1 });
    throw error;
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
