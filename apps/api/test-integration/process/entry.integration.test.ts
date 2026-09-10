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

const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
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
      NODE_ENV: "production",
      IAM_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_API_SMS_SIGNATURE_KEY: "unreachable-smoke-signature",
      IAM_API_SMS_URL: "http://127.0.0.1:1/sms",
      IAM_API_SESSION_DEFAULT_TTL_SECONDS: "3600",
      IAM_API_AUTH_CODE_TTL_SECONDS: "300",
      IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "7",
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
      IAM_API_LOG_LEVEL: "info",
      IAM_API_LOG_FORMAT: "json",
      IAM_API_CAP_ENABLED: "false",
      IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "entry-smoke",
      IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
        "entry-smoke": loginCredentialPrivateKey,
      }),
      IAM_API_SESSION_KERNEL_NAMESPACE: `sess:api-entry-smoke:${context.port}:`,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

async function probeApiDocs(origin: string, signal: AbortSignal) {
  const publicDocument = await readOpenApiDocument(
    `${origin}/public/doc`,
    "通用用户API",
    signal,
  );
  const authDocument = await readOpenApiDocument(
    `${origin}/auth/doc`,
    "认证API",
    signal,
  );
  const ssoDocument = await readOpenApiDocument(
    `${origin}/sso/doc`,
    "单点登录API",
    signal,
  );
  const internalDocument = await readOpenApiDocument(
    `${origin}/internal/doc`,
    "内部API",
    signal,
  );
  return { authDocument, internalDocument, publicDocument, ssoDocument };
}

async function readOpenApiDocument(
  url: string,
  expectedTitle: string,
  signal: AbortSignal,
) {
  const response = await fetch(url, { signal });
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
    throw new PortCollisionError("port did not serve an API OpenAPI document", { cause: error });
  }
  const info = document.info;
  if (
    document.openapi !== "3.1.0"
    || typeof info !== "object"
    || info === null
    || (info as Record<string, unknown>).title !== expectedTitle
    || (info as Record<string, unknown>).version !== "1.0.0"
  ) {
    throw new PortCollisionError(`port served an unexpected ${expectedTitle} OpenAPI document`);
  }
  return document;
}

describe("API entry", () => {
  test("starts the production entry with canonical Internal User routes", async () => {
    const result = await entrySmoke.run({
      start: context => spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts"],
        cwd: apiRoot,
        env: createEntryEnvironment(context),
      }),
      probe: (context, signal) => probeApiDocs(entryOrigin(context), signal),
      childReadinessEvidence: context => `server: ${entryOrigin(context)}`,
    });

    expect(result.publicDocument).toMatchObject({
      openapi: "3.1.0",
      info: { title: "通用用户API", version: "1.0.0" },
    });
    expect(result.authDocument).toMatchObject({
      openapi: "3.1.0",
      info: { title: "认证API", version: "1.0.0" },
    });
    expect(result.ssoDocument).toMatchObject({
      openapi: "3.1.0",
      info: { title: "单点登录API", version: "1.0.0" },
    });
    expect(result.internalDocument.paths).toMatchObject({
      "/internal/users/:username": { get: expect.any(Object) },
      "/internal/users/search-dsl": { post: expect.any(Object) },
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
