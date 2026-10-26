import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import postgres from "postgres";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

async function migrate(databaseUrl: string, expectedExitCode: number) {
  return await runProcessCommandSmoke({
    label: "IAM formal database:migrate command",
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "database:migrate"],
        cwd: workerRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          IAM_WORKER_DATABASE_URL: databaseUrl,
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

test("正式 database:migrate 子进程迁移真实空库，重复迁移保留账本、对象身份和源行", async () => {
  const input = process.env.IAM_WORKER_TEST_DATABASE_URL;
  if (!input) throw new Error("IAM_WORKER_TEST_DATABASE_URL must identify the caller-provided managed test database");
  const connection = new URL(input);
  if (
    !["postgres:", "postgresql:"].includes(connection.protocol) ||
    ["", "postgres", "template0", "template1"].includes(decodeURIComponent(connection.pathname.slice(1)).toLowerCase())
  ) {
    throw new Error("migration command test requires a non-system test database");
  }
  const database = `iam_migrate_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(connection.href, { max: 1 });
  let created = false;
  let target: ReturnType<typeof postgres> | undefined;
  try {
    // The native migrator owns drizzle's default journal, so a schema-only fixture is insufficient.
    await admin.unsafe(`CREATE DATABASE "${database}" TEMPLATE template0`);
    created = true;
    connection.pathname = `/${database}`;
    connection.search = "";
    const first = await migrate(connection.href, 0);
    expect(first.output).toContain('{"migration":"complete"}');
    expect(first.output).not.toContain(connection.href);
    target = postgres(connection.href, { max: 1 });
    const journal = [...(await target`select id, hash, created_at from drizzle.__drizzle_migrations order by id`)];
    expect(journal.length).toBeGreaterThan(0);
    const tables = [
      ...(await target`select oid::text, relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname`),
    ];
    expect(tables.some((row) => row.relname === "user_profile")).toBe(true);
    await target`insert into client (client_code, client_name, client_secret, ext_attributes)
      values ('owned-migration-marker', '受控迁移标记', 'owned-unused-secret', '{}'::jsonb)`;
    const second = await migrate(connection.href, 0);
    expect(second.output).toContain('{"migration":"complete"}');
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
    try {
      await target?.end({ timeout: 1 });
      if (created) await admin.unsafe(`DROP DATABASE "${database}"`);
    } finally {
      await admin.end({ timeout: 1 });
    }
  }
}, 45_000);

test("正式迁移连接失败不输出完成或连接凭据", async () => {
  const connection = "postgresql://owned-user:OWNED_CLI_SECRET@127.0.0.1:1/owned_unavailable";
  const result = await migrate(connection, 1);
  expect(result.output).not.toContain('"migration":"complete"');
  expect(result.output).not.toContain("OWNED_CLI_SECRET");
  expect(result.output).not.toContain(connection);
}, 25_000);
