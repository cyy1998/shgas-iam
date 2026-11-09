import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/test-support/process-smoke-harness";
import { createOpsPostgresTestHarness } from "../support/postgres-test-harness";

let harness: Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;
beforeAll(async () => {
  harness = await createOpsPostgresTestHarness();
});
afterAll(async () => {
  await harness?.close();
});

test("the formal PostgreSQL-only CLI accepts a standard URI with an uppercase scheme", async () => {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("IAM_OPS_")));
  const uri = harness.commandDatabaseUrl.replace(/^[^:]+:/u, "POSTGRESQL:");
  const result = await runProcessCommandSmoke({
    label: "Ops uppercase PostgreSQL scheme",
    completionTimeoutMs: 10000,
    cleanupTimeoutMs: 5000,
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts", "employment", "verify"],
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: { ...environment, NODE_ENV: "test", IAM_OPS_DATABASE_URL: uri, IAM_OPS_LOG_FORMAT: "json" },
      }),
  });
  expect(result.output).toContain('"status":"passed"');
  expect(result.output).not.toContain(uri);
  const remaining = await harness.sql`SELECT pid FROM pg_stat_activity WHERE application_name LIKE 'iam-org-%'`;
  expect([...remaining]).toEqual([]);
}, 15000);

test("source artifact loads only its own private env and inherited process values take precedence", async () => {
  await withOwnedTemporaryDirectory({
    prefix: "iam-ops-env-",
    cleanupTimeoutMs: 5000,
    async run(directory) {
      const output = join(directory, "src");
      await mkdir(output);
      const foreignWorkingDirectory = join(directory, "worker");
      await mkdir(foreignWorkingDirectory);
      const built = await Bun.build({
        entrypoints: [fileURLToPath(new URL("../../src/index.ts", import.meta.url))],
        outdir: output,
        target: "bun",
        packages: "bundle",
        naming: "index.js",
      });
      expect(built.success).toBe(true);
      await writeFile(
        join(directory, ".env"),
        `NODE_ENV=test\nIAM_OPS_DATABASE_URL=${JSON.stringify(harness.commandDatabaseUrl)}\nIAM_OPS_LOG_FORMAT=json\n`,
      );
      await writeFile(
        join(foreignWorkingDirectory, ".env"),
        "IAM_OPS_DATABASE_URL=private-wrong-working-directory\nIAM_WORKER_DATABASE_URL=private-old-worker\n",
      );
      const environment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("IAM_OPS_")),
      );
      async function run(expectedExitCode: number, overrides: NodeJS.ProcessEnv) {
        return await runProcessCommandSmoke({
          label: "Ops own env",
          expectedExitCode,
          completionTimeoutMs: 10_000,
          cleanupTimeoutMs: 5000,
          start: () =>
            spawnOwnedProcessTree({
              executable: process.execPath,
              args: ["--no-env-file", "run", join(output, "index.js"), "employment", "verify"],
              cwd: foreignWorkingDirectory,
              env: { ...environment, ...overrides },
            }),
        });
      }
      const fromFile = await run(0, {});
      expect(fromFile.output).toContain('"status":"passed"');
      expect(fromFile.output).toContain('"sourceApp":"iam-ops"');
      const inherited = await run(1, { IAM_OPS_DATABASE_URL: "" });
      expect(inherited.output).toContain("IAM_OPS_DATABASE_URL");
      expect(inherited.output).not.toContain("verification completed");
      const invalid = await runProcessCommandSmoke({
        label: "Ops rejects argv before maintenance",
        expectedExitCode: 1,
        completionTimeoutMs: 10_000,
        cleanupTimeoutMs: 5000,
        start: () =>
          spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", join(output, "index.js"), "employment", "verify", "--unknown"],
            cwd: foreignWorkingDirectory,
            env: environment,
          }),
      });
      expect(invalid.output).not.toContain("verification completed");
      const [row] = await harness.sql`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name LIKE 'iam-org-%' AND query NOT LIKE '%pg_stat_activity%'`;
      expect(row?.count).toBe(0);
    },
  });
}, 45_000);
