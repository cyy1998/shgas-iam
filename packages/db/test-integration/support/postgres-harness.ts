import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { requireDedicatedPostgresTestUrl, TEST_POSTGRES_URL_ENV } from "@iam/test-support/postgres-test-harness";
import postgres from "postgres";

export interface PostgresTestHarness {
  readonly schemaName: string;
  readonly commandDatabaseUrl: string;
  readonly sql: ReturnType<typeof postgres>;
  readonly close: () => Promise<void>;
}

export async function expectPostgresErrorCode(operation: PromiseLike<unknown>, expectedCode: string): Promise<void> {
  try {
    await operation;
  } catch (error) {
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

    const commandDatabaseUrl = new URL(databaseUrl);
    commandDatabaseUrl.searchParams.set("options", `-c search_path=${schemaName}`);
    return {
      schemaName,
      commandDatabaseUrl: commandDatabaseUrl.toString(),
      sql: scopedSql,
      async close() {
        await scopedSql!.end();
        await adminSql.unsafe(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
        await adminSql.end();
      },
    };
  } catch (error) {
    if (scopedSql) await scopedSql.end({ timeout: 1 });
    if (schemaCreated) await adminSql.unsafe(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
    await adminSql.end({ timeout: 1 });
    throw error;
  }
}

function requireDedicatedTestDatabaseUrl(): string {
  const databaseUrl = process.env[TEST_POSTGRES_URL_ENV]?.trim();
  if (!databaseUrl) {
    throw new Error(
      `${TEST_POSTGRES_URL_ENV} must point to a dedicated PostgreSQL test database; no fallback is allowed`,
    );
  }
  return requireDedicatedPostgresTestUrl({
    name: TEST_POSTGRES_URL_ENV,
    value: databaseUrl,
    environment: process.env,
  });
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z0-9_]+$/u.test(identifier)) throw new Error("test schema name contains unsafe characters");
  return `"${identifier}"`;
}
