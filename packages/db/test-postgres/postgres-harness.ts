import { randomUUID } from "node:crypto";
import { expect } from "bun:test";
import postgres from "postgres";

const TEST_DATABASE_URL_ENV = "IAM_DB_TEST_DATABASE_URL";
const RESERVED_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);

export interface PostgresTestHarness {
  readonly schemaName: string;
  readonly sql: ReturnType<typeof postgres>;
  readonly close: () => Promise<void>;
}

export async function expectPostgresErrorCode(
  operation: PromiseLike<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation;
  }
  catch (error) {
    expect(error).toMatchObject({ code: expectedCode });
    return;
  }

  throw new Error(`Expected PostgreSQL operation to reject with SQLSTATE ${expectedCode}`);
}

export async function createPostgresTestHarness(): Promise<PostgresTestHarness> {
  const databaseUrl = requireDedicatedTestDatabaseUrl();
  const schemaName = `iam_db_subject_identifier_${randomUUID().replaceAll("-", "")}`;
  const adminSql = postgres(databaseUrl, { max: 1 });
  let scopedSql: ReturnType<typeof postgres> | undefined;
  let schemaCreated = false;

  try {
    await adminSql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    schemaCreated = true;
    scopedSql = postgres(databaseUrl, {
      connection: { search_path: schemaName },
      max: 1,
    });

    return {
      schemaName,
      sql: scopedSql,
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
    if (schemaCreated)
      await adminSql.unsafe(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
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

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  }
  catch {
    throw new Error(`${TEST_DATABASE_URL_ENV} must be a valid PostgreSQL URL`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    throw new Error(`${TEST_DATABASE_URL_ENV} must use the postgres or postgresql protocol`);

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName || RESERVED_DATABASE_NAMES.has(databaseName.toLowerCase())) {
    throw new Error(`${TEST_DATABASE_URL_ENV} must name a dedicated, non-system test database`);
  }

  return databaseUrl;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z0-9_]+$/u.test(identifier))
    throw new Error("test schema name contains unsafe characters");
  return `"${identifier}"`;
}
