import { expect, test } from "bun:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createEmptyPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationsFolder = fileURLToPath(new URL("../../../../packages/db/src/migrations/", import.meta.url));

async function applyMigrations(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    await migrate(drizzle({ client: sql }), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

test("迁移真实空库，重复迁移保留账本、对象身份和源行", async () => {
  const {
    databaseUrl,
    sql: target,
    close,
  } = await createEmptyPostgresTestHarness({
    environment: process.env,
    name: "IAM_TEST_POSTGRES_URL",
  });
  try {
    const [empty] = await target`SELECT to_regclass('drizzle.__drizzle_migrations') AS journal,
      to_regclass('public.user_document') AS document`;
    expect(empty).toEqual({ journal: null, document: null });
    await applyMigrations(databaseUrl);
    const journal = [...(await target`select id, hash, created_at from drizzle.__drizzle_migrations order by id`)];
    expect(journal.length).toBeGreaterThan(0);
    const tables = [
      ...(await target`select oid::text, relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname`),
    ];
    expect(tables.some((row) => row.relname === "user_document")).toBe(true);
    await target`insert into client (client_code, client_name, client_secret, ext_attributes)
      values ('owned-migration-marker', '受控迁移标记', 'owned-unused-secret', '{}'::jsonb)`;
    await applyMigrations(databaseUrl);
    const repeatedJournal = [
      ...(await target`select id, hash, created_at from drizzle.__drizzle_migrations order by id`),
    ];
    const repeatedTables = [
      ...(await target`select oid::text, relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname`),
    ];
    const marker = await target`select client_name from client where client_code='owned-migration-marker'`;
    expect(repeatedJournal).toEqual(journal);
    expect(repeatedTables).toEqual(tables);
    expect(marker[0]?.client_name).toBe("受控迁移标记");
  } finally {
    await close();
  }
}, 45_000);

test("正式迁移连接失败不输出完成或连接凭据", async () => {
  const connection = "postgresql://owned-user:OWNED_CLI_SECRET@127.0.0.1:1/owned_unavailable";
  let failure: unknown;
  try {
    await applyMigrations(connection);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).not.toContain("OWNED_CLI_SECRET");
  expect(String(failure)).not.toContain(connection);
}, 25_000);
