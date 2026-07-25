import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  PortCollisionError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { afterEach, describe, expect, test } from "bun:test";

const apiRoot = fileURLToPath(new URL("../", import.meta.url));
const loginCredentialPrivateKey = "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65";
const entrySmoke = createProcessSmokeSuite({
  label: "API entry",
  temporaryDirectoryPrefix: "iam-api-entry-smoke-",
  hostname: "localhost",
});

afterEach(entrySmoke.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

function createEntryEnvironment(context: ProcessSmokeAttemptContext) {
  const origin = entryOrigin(context);
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_API_SMS_SIGNATURE_KEY: "unreachable-smoke-signature",
      IAM_API_SMS_URL: "http://127.0.0.1:1/sms",
      IAM_API_SESSION_DEFAULT_TTL_SECONDS: "3600",
      IAM_API_AUTH_CODE_TTL_SECONDS: "300",
      IAM_API_ORCAS_URL: "http://127.0.0.1:1/orcas",
      IAM_API_PORT: String(context.port),
      IAM_API_WECHAT_CORP_ID: "unreachable-smoke-corp",
      IAM_API_WECHAT_CORP_SECRET: "unreachable-smoke-secret",
      IAM_API_MAGIC_CODE: "000000",
      IAM_API_REDIS_HOST: "127.0.0.1",
      IAM_API_REDIS_PORT: "1",
      IAM_API_REDIS_DB: "15",
      IAM_API_LOGIN_ENDPOINT: "/login",
      IAM_API_SSO_INTERNAL_ORIGIN: origin,
      IAM_API_SSO_EXTERNAL_ORIGIN: origin,
      IAM_API_AUTHORIZATION_ENDPOINT: "/sso/authorize",
      IAM_API_LOGOUT_ENDPOINT: "/sso/logout",
      IAM_API_THIRDPARTY_OA_ENDPOINT: "/sso/thirdparty/oa",
      IAM_API_LOG_LEVEL: "silent",
      IAM_API_LOG_FORMAT: "json",
      IAM_API_CAP_ENABLED: "false",
      IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "entry-smoke",
      IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
        "entry-smoke": loginCredentialPrivateKey,
      }),
      IAM_API_SESSION_KERNEL_NAMESPACE: `sess:api-entry-smoke:${context.port}:`,
      IAM_API_SESSION_LOOKUP_HMAC_CURRENT_ID: "entry-smoke",
      IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: "api-entry-smoke-secret-that-is-at-least-32-bytes",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

async function probeApiDocs(origin: string, signal: AbortSignal) {
  const response = await fetch(`${origin}/public/doc`, { signal });
  if (response.status !== 200) {
    throw new PortCollisionError(
      `port served an unexpected API readiness status: expected 200, received ${response.status}`,
    );
  }

  let document: Record<string, unknown>;
  try {
    document = await response.json() as Record<string, unknown>;
  }
  catch (error) {
    throw new PortCollisionError("port did not serve the API OpenAPI document", { cause: error });
  }
  const info = document.info;
  if (
    document.openapi !== "3.1.0"
    || typeof info !== "object"
    || info === null
    || (info as Record<string, unknown>).title !== "通用用户API"
    || (info as Record<string, unknown>).version !== "1.0.0"
  ) {
    throw new PortCollisionError("port served an unexpected API OpenAPI document");
  }
  return document;
}

describe("API entry", () => {
  test("starts through Bun, parsed environment, and the real production composition", async () => {
    const document = await entrySmoke.run({
      start(context) {
        return spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "src/index.ts"],
          cwd: apiRoot,
          env: createEntryEnvironment(context),
        });
      },
      probe: (context, signal) => probeApiDocs(entryOrigin(context), signal),
      childReadinessEvidence: context => `server: ${entryOrigin(context)}`,
    });

    expect(document).toMatchObject({
      openapi: "3.1.0",
      info: {
        title: "通用用户API",
        version: "1.0.0",
      },
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
