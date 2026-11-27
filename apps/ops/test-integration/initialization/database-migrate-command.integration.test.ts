import { expect, test } from "bun:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createEmptyPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/test-support/process-smoke-harness";

const dbRoot = fileURLToPath(new URL("../../../../packages/db/", import.meta.url));

async function migrate(databaseUrl: string, expectedExitCode: number) {
  return await runProcessCommandSmoke({
    label: "IAM formal db:migrate command",
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "db:migrate"],
        cwd: dbRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: databaseUrl,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
      }),
    expectedExitCode,
    completionTimeoutMs: 15_000,
    cleanupTimeoutMs: 5_000,
    maxOutputBytes: 64 * 1024,
  });
}

test("正式 db:migrate 子进程迁移真实空库，重复迁移保留账本、对象身份和源行", async () => {
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
    const first = await migrate(databaseUrl, 0);
    expect(first.output).not.toContain(databaseUrl);
    const journal = [...(await target`select id, hash, created_at from drizzle.__drizzle_migrations order by id`)];
    expect(journal.length).toBeGreaterThan(0);
    const tables = [
      ...(await target`select oid::text, relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname`),
    ];
    expect(tables.some((row) => row.relname === "user_document")).toBe(true);
    await target`insert into client (client_code, client_name, client_secret, ext_attributes)
      values ('owned-migration-marker', '受控迁移标记', 'owned-unused-secret', '{}'::jsonb)`;
    await migrate(databaseUrl, 0);
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
  const result = await migrate(connection, 1);
  expect(result.output).not.toContain("migrations applied successfully");
  expect(result.output).not.toContain("OWNED_CLI_SECRET");
  expect(result.output).not.toContain(connection);
}, 25_000);
