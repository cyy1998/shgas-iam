import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { requireExternalTestUrl } from "@iam/test-support/external-test-resources";
import {
  captureProcessOutput,
  createProcessSmokeEnvironment,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
  withReadyProcess,
} from "@iam/test-support/process-smoke-harness";
import { useAuthApiPostgresTestHarness } from "../support/postgres-test-file.fixture";

const getDatabase = useAuthApiPostgresTestHarness();
const entryOptions = {
  label: "Auth API production entry",
  temporaryDirectoryPrefix: "iam-auth-api-entry-",
  hostname: "localhost",
};

const redisUrl = requireExternalTestUrl({
  environment: process.env,
  lane: "Auth API entry",
  name: "IAM_TEST_REDIS_URL",
});

test(
  "starts with authentication settings alone, checks dependencies and stops on SIGTERM",
  async () => {
    let capture: ReturnType<typeof captureProcessOutput> | undefined;
    const result = await withReadyProcess({
      ...entryOptions,
      start(context) {
        const origin = `http://${context.hostname}:${context.port}`;
        const child = spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "src/index.ts"],
          cwd: fileURLToPath(new URL("../../", import.meta.url)),
          env: createProcessSmokeEnvironment({
            source: process.env,
            temporaryDirectory: context.temporaryDirectory,
            overrides: {
              NODE_ENV: "production",
              IAM_AUTH_API_PORT: String(context.port),
              IAM_AUTH_API_DATABASE_URL: getDatabase().databaseUrl,
              IAM_AUTH_API_REDIS_URL: redisUrl,
              IAM_AUTH_API_SSO_INTERNAL_ORIGIN: origin,
              IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: "https://external.example.test",
              IAM_AUTH_API_SMS_URL: "http://127.0.0.1:1/sms",
              IAM_AUTH_API_SMS_SIGNATURE_KEY: "fixture",
              IAM_AUTH_API_WECHAT_CORP_ID: "fixture",
              IAM_AUTH_API_WECHAT_CORP_SECRET: "fixture",
              IAM_AUTH_API_MAGIC_CODE: "000000",
              IAM_AUTH_API_LOG_FORMAT: "json",
              IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID: "entry-test",
              IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({ "entry-test": "1".repeat(64) }),
            },
          }),
        });
        capture = captureProcessOutput(child, 32 * 1024);
        return child;
      },
      childReadinessEvidence: (context) => `server: http://${context.hostname}:${context.port}`,
      async probe(context, signal) {
        const origin = `http://${context.hostname}:${context.port}`;
        const ready = await fetch(`${origin}/ready`, { signal, headers: { Connection: "close" } });
        const readiness = { status: ready.status, body: await ready.json() };
        if (readiness.status !== 200) return undefined;
        const health = await fetch(`${origin}/health`, { signal, headers: { Connection: "close" } });
        return { readiness, health: { status: health.status, body: await health.json() } };
      },
    });
    expect(result).toEqual({
      readiness: { status: 200, body: { status: "ok" } },
      health: { status: 200, body: { status: "ok" } },
    });
    const logs = capture?.() ?? "";
    expect(logs).toContain('"sourceApp":"auth-api"');
    expect(logs).toContain('"event":"auth.api.stopped"');
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);
