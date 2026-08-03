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
import {
  createProcessSmokeRedisServer,
} from "@iam/api-core/testing/process-smoke-redis-server";
import { expect, test } from "bun:test";

const apiCoreRoot = fileURLToPath(new URL("../", import.meta.url));
const currentOidcKey = "oidc:model:AccessToken:profile-override-smoke";
const cleanupScriptEntryArgs = [
  "--no-env-file",
  "scripts/cleanup-legacy-session-keys.ts",
  "--profile",
  "custom-sso-cutover",
] as const;

const legacyCustomSsoKeys = [
  "global_session:cutover-principal-session",
  "auth_code:cutover-authorization-grant",
  "local_gateway_session:cutover-local-session",
  "local_session_reverse:cutover-local-session",
  "local_session_set:cutover-principal-session",
  "custom-sso:local-session-payload:cutover-wide-payload",
] as const;

const preservedOidcKeys = [
  "oidc:model:AccessToken:cutover-access-token",
  "oidc:provider-session-binding:cutover-provider-session",
] as const;

test("dedicated Custom SSO cleanup runs dry-run, blocking verify, apply, and clean verify without deleting OIDC", async () => {
  const redis = await createProcessSmokeRedisServer({
    values: new Map([
      ...legacyCustomSsoKeys.map(key => [key, `sensitive:${key}`] as const),
      ...preservedOidcKeys.map(key => [key, `sensitive:${key}`] as const),
    ]),
  });
  try {
    await withOwnedTemporaryDirectory({
      prefix: "iam-custom-sso-cleanup-rehearsal-",
      cleanupTimeoutMs: 5_000,
      run: async (temporaryDirectory) => {
        const runCleanup = async (
          mode: "--apply" | "--dry-run" | "--verify",
          expectedExitCode: number,
        ) => await runProcessCommandSmoke({
          label: `Custom SSO cutover cleanup ${mode}`,
          completionTimeoutMs: 10_000,
          cleanupTimeoutMs: 5_000,
          expectedExitCode,
          start: () => spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              ...cleanupScriptEntryArgs,
              mode,
              "--batch-size",
              "2",
            ],
            cwd: apiCoreRoot,
            env: createProcessSmokeEnvironment({
              source: process.env,
              temporaryDirectory,
              overrides: {
                IAM_REDIS_HOST: redis.hostname,
                IAM_REDIS_PORT: String(redis.port),
                IAM_REDIS_DB: "0",
                FORCE_COLOR: "0",
                NO_COLOR: "1",
              },
            }),
          }),
        });

        const dryRun = await runCleanup("--dry-run", 0);
        expect(dryRun.output).toContain("\"mode\":\"dry-run\"");
        expect(dryRun.output).toContain("\"profile\":\"custom-sso-cutover\"");

        const blockedVerify = await runCleanup("--verify", 1);
        expect(blockedVerify.output).toContain(
          "\"errorName\":\"LegacySessionCleanupVerificationError\"",
        );

        const apply = await runCleanup("--apply", 0);
        expect(apply.output).toContain("\"mode\":\"apply\"");

        const cleanVerify = await runCleanup("--verify", 0);
        expect(cleanVerify.output).toContain("\"mode\":\"verify\"");
        expect(cleanVerify.output).toContain("\"result\":\"completed\"");

        const combinedOutput = [
          dryRun.output,
          blockedVerify.output,
          apply.output,
          cleanVerify.output,
        ].join("\n");
        for (const key of [...legacyCustomSsoKeys, ...preservedOidcKeys]) {
          expect(combinedOutput).not.toContain(key);
        }
      },
    });

    for (const key of legacyCustomSsoKeys)
      expect(redis.delete(key)).toBeFalse();
    for (const key of preservedOidcKeys)
      expect(redis.delete(key)).toBeTrue();
  }
  finally {
    await redis.close();
  }
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("dedicated Custom SSO cleanup rejects a trailing profile before touching Redis", async () => {
  const redis = await createProcessSmokeRedisServer({
    values: new Map([[currentOidcKey, "current-oidc-artifact"]]),
  });
  try {
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
              IAM_REDIS_HOST: redis.hostname,
              IAM_REDIS_PORT: String(redis.port),
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
    expect(redis.commands).toEqual([]);
    expect(redis.delete(currentOidcKey)).toBeTrue();
  }
  finally {
    await redis.close();
  }
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);

test("dedicated Custom SSO cleanup disables env-file loading in every Bun layer", async () => {
  expect(process.env.IAM_REDIS_PASSWORD).toBeUndefined();
  const redis = await createProcessSmokeRedisServer();
  try {
    await withOwnedTemporaryDirectory({
      prefix: "iam-custom-sso-cleanup-env-smoke-",
      cleanupTimeoutMs: 5_000,
      run: async (temporaryDirectory) => {
        await writeFile(
          join(temporaryDirectory, ".env.test"),
          "IAM_REDIS_PASSWORD=process-smoke-env-file-must-not-load\n",
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
        await runProcessCommandSmoke({
          label: "Custom SSO cutover cleanup env isolation",
          completionTimeoutMs: 10_000,
          cleanupTimeoutMs: 5_000,
          expectedExitCode: 0,
          start: () => spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "--no-env-file",
              "run",
              "cleanup",
            ],
            cwd: temporaryDirectory,
            env: createProcessSmokeEnvironment({
              source: process.env,
              temporaryDirectory,
              overrides: {
                NODE_ENV: "test",
                IAM_REDIS_HOST: redis.hostname,
                IAM_REDIS_PORT: String(redis.port),
                IAM_REDIS_DB: "0",
                FORCE_COLOR: "0",
                NO_COLOR: "1",
              },
            }),
          }),
        });
      },
    });

    expect(redis.commands.some(command => command.name === "auth")).toBeFalse();
  }
  finally {
    await redis.close();
  }
}, PROCESS_SMOKE_TEST_TIMEOUT_MS);
