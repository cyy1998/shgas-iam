import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { expect, test } from "bun:test";

const apiCoreRoot = fileURLToPath(new URL("../../", import.meta.url));
const cleanupRedisHarnessImportUrl = new URL(
  "../../src/testing/custom-sso-cleanup-redis-harness.ts",
  import.meta.url,
).href;
const cleanupScriptEntryArgs = [
  "--no-env-file",
  "run",
  "session:cleanup-custom-sso-cutover",
  "--",
] as const;

async function runCleanupRedisHarnessPreflight(overrides: NodeJS.ProcessEnv) {
  return await withOwnedTemporaryDirectory({
    prefix: "iam-custom-sso-cleanup-preflight-",
    cleanupTimeoutMs: 5_000,
    run: async temporaryDirectory => await runProcessCommandSmoke({
      label: "Custom SSO cleanup Redis resource preflight",
      completionTimeoutMs: 10_000,
      cleanupTimeoutMs: 5_000,
      expectedExitCode: 1,
      start: () => spawnOwnedProcessTree({
        executable: process.execPath,
        args: [
          "--no-env-file",
          "--eval",
          [
            `const module = await import(${JSON.stringify(cleanupRedisHarnessImportUrl)});`,
            "const harness = await module.createCustomSsoCleanupRedisHarness();",
            "await harness.close();",
          ].join(" "),
        ],
        cwd: apiCoreRoot,
        env: createProcessSmokeEnvironment({
          source: process.env,
          temporaryDirectory,
          overrides: {
            ...overrides,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
        }),
      }),
    }),
  });
}

test("cleanup Redis harness rejects the ordinary API Core test logical DB before connecting", async () => {
  const result = await runCleanupRedisHarnessPreflight({
    IAM_API_CORE_CLEANUP_TEST_REDIS_URL:
      "redis://cleanup-user:cleanup-secret@REDIS.SHARED.INVALID.:6379/7",
    IAM_API_CORE_TEST_REDIS_URL:
      "redis://ordinary-user:ordinary-secret@redis.shared.invalid/07",
  });

  expect(result.output).toContain(
    "IAM_API_CORE_CLEANUP_TEST_REDIS_URL must not identify the same Redis logical DB as IAM_API_CORE_TEST_REDIS_URL",
  );
  expect(result.output).not.toContain("cleanup-secret");
  expect(result.output).not.toContain("ordinary-secret");
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("cleanup Redis harness rejects another caller-owned test logical DB before connecting", async () => {
  const result = await runCleanupRedisHarnessPreflight({
    IAM_ADMIN_API_TEST_REDIS_URL:
      "redis://admin-user:admin-secret@ADMIN.SHARED.INVALID.:6379/11",
    IAM_API_CORE_CLEANUP_TEST_REDIS_URL:
      "redis://cleanup-user:cleanup-secret@admin.shared.invalid/011",
  });

  expect(result.output).toContain(
    "IAM_API_CORE_CLEANUP_TEST_REDIS_URL must not identify the same Redis logical DB as IAM_ADMIN_API_TEST_REDIS_URL",
  );
  expect(result.output).not.toContain("admin-secret");
  expect(result.output).not.toContain("cleanup-secret");
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("cleanup Redis harness rejects query-based connection identity before connecting", async () => {
  const result = await runCleanupRedisHarnessPreflight({
    IAM_API_CORE_CLEANUP_TEST_REDIS_URL:
      "redis://cleanup-user:query-secret@query-bypass.invalid:6379/0?db=12",
    IAM_API_CORE_TEST_REDIS_URL:
      "redis://ordinary-user:ordinary-secret@query-bypass.invalid:6379/12",
  });

  expect(result.output).toContain(
    "IAM_API_CORE_CLEANUP_TEST_REDIS_URL must not contain query parameters because connection identity must be unambiguous",
  );
  expect(result.output).not.toContain("query-secret");
  expect(result.output).not.toContain("ordinary-secret");
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("cleanup Redis harness rejects an empty URL hostname before identity comparison", async () => {
  const result = await runCleanupRedisHarnessPreflight({
    IAM_API_CORE_CLEANUP_TEST_REDIS_URL: "redis:///0",
    IAM_API_CORE_TEST_REDIS_URL: "redis:///0",
  });

  expect(result.output).toContain(
    "IAM_API_CORE_CLEANUP_TEST_REDIS_URL must identify a Redis hostname",
  );
  expect(result.output).not.toContain("redis:///0");
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("cleanup Redis harness rejects an explicit runtime Redis URL logical DB before connecting", async () => {
  const result = await runCleanupRedisHarnessPreflight({
    IAM_API_CORE_CLEANUP_TEST_REDIS_URL:
      "redis://cleanup-user:cleanup-secret@RUNTIME.SHARED.INVALID.:6379/8",
    REDIS_URL: "rediss://runtime-user:runtime-secret@runtime.shared.invalid/08",
  });

  expect(result.output).toContain(
    "IAM_API_CORE_CLEANUP_TEST_REDIS_URL must not identify the same Redis logical DB as REDIS_URL",
  );
  expect(result.output).not.toContain("cleanup-secret");
  expect(result.output).not.toContain("runtime-secret");
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("cleanup Redis harness rejects the runtime host-port-DB logical DB before connecting", async () => {
  const result = await runCleanupRedisHarnessPreflight({
    IAM_API_CORE_CLEANUP_TEST_REDIS_URL:
      "redis://cleanup-user:cleanup-secret@IAM-RUNTIME.INVALID.:6379/9",
    IAM_REDIS_HOST: "iam-runtime.invalid",
    IAM_REDIS_PORT: "06379",
    IAM_REDIS_DB: "09",
  });

  expect(result.output).toContain(
    "IAM_API_CORE_CLEANUP_TEST_REDIS_URL must not identify the same Redis logical DB as IAM_REDIS_HOST/IAM_REDIS_PORT/IAM_REDIS_DB",
  );
  expect(result.output).not.toContain("cleanup-secret");
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("cleanup Redis harness canonicalizes IPv6 URL brackets before comparing runtime identity", async () => {
  const result = await runCleanupRedisHarnessPreflight({
    IAM_API_CORE_CLEANUP_TEST_REDIS_URL:
      "redis://cleanup-user:ipv6-secret@[::1]:1/13",
    IAM_REDIS_HOST: "::1",
    IAM_REDIS_PORT: "1",
    IAM_REDIS_DB: "13",
  });

  expect(result.output).toContain(
    "IAM_API_CORE_CLEANUP_TEST_REDIS_URL must not identify the same Redis logical DB as IAM_REDIS_HOST/IAM_REDIS_PORT/IAM_REDIS_DB",
  );
  expect(result.output).not.toContain("ipv6-secret");
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("dedicated Custom SSO cleanup rejects a trailing profile before touching Redis", async () => {
  const result = await withOwnedTemporaryDirectory({
    prefix: "iam-custom-sso-cleanup-smoke-",
    cleanupTimeoutMs: 5_000,
    run: async temporaryDirectory => await runProcessCommandSmoke({
      label: "Custom SSO cutover cleanup profile override",
      completionTimeoutMs: 10_000,
      cleanupTimeoutMs: 5_000,
      expectedExitCode: 1,
      start: () => spawnOwnedProcessTree({
        executable: process.execPath,
        args: [
          ...cleanupScriptEntryArgs,
          "--profile",
          "all",
          "--apply",
        ],
        cwd: apiCoreRoot,
        env: createProcessSmokeEnvironment({
          source: process.env,
          temporaryDirectory,
          overrides: {
            IAM_REDIS_HOST: "127.0.0.1",
            IAM_REDIS_PORT: "1",
            IAM_REDIS_DB: "0",
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
        }),
      }),
    }),
  });

  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("Specify --profile only once");
  expect(result.output).not.toContain("ECONNREFUSED");
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("dedicated Custom SSO cleanup ignores malicious env files at every Bun layer", async () => {
  expect(process.env.REDIS_URL).toBeUndefined();
  await withOwnedTemporaryDirectory({
    prefix: "iam-custom-sso-cleanup-env-smoke-",
    cleanupTimeoutMs: 5_000,
    run: async (temporaryDirectory) => {
      await writeFile(
        join(temporaryDirectory, ".env.test"),
        "REDIS_URL=redis://env-file-user:env-file-secret@127.0.0.1:1/0\n",
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await writeFile(
        join(temporaryDirectory, ".env"),
        "REDIS_URL=redis://env-file-user:env-file-secret@127.0.0.1:1/0\n",
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await writeFile(
        join(temporaryDirectory, "package.json"),
        JSON.stringify({
          private: true,
          scripts: {
            cleanup: [
              "bun --no-env-file run",
              JSON.stringify(join(
                apiCoreRoot,
                "scripts",
                "cleanup-legacy-session-keys.ts",
              )),
              "--profile custom-sso-cutover --dry-run",
            ].join(" "),
          },
        }),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      const result = await runProcessCommandSmoke({
        label: "Custom SSO cutover cleanup env isolation",
        completionTimeoutMs: 10_000,
        cleanupTimeoutMs: 5_000,
        expectedExitCode: 1,
        start: () => spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "cleanup"],
          cwd: temporaryDirectory,
          env: createProcessSmokeEnvironment({
            source: process.env,
            temporaryDirectory,
            overrides: {
              NODE_ENV: "test",
              IAM_REDIS_HOST: "127.0.0.1",
              IAM_REDIS_PORT: "not-a-port",
              IAM_REDIS_DB: "0",
              FORCE_COLOR: "0",
              NO_COLOR: "1",
            },
          }),
        }),
      });

      expect(result.output).toContain("Port should be >= 0 and < 65536. Received NaN");
      expect(result.output).not.toContain("env-file-secret");
    },
  });
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);
