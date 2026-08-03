import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  FatalReadinessError,
  PortCollisionError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import {
  createProcessSmokeRedisServer,
  seedProcessSmokePrincipalSession,
} from "@iam/api-core/testing/process-smoke-redis-server";
import { ApiErrorCode } from "@iam/contracts";
import { afterEach, describe, expect, test } from "bun:test";

const adminApiRoot = fileURLToPath(new URL("../", import.meta.url));
const lookupHmacId = "entry-smoke";
const lookupHmacSecret = "admin-api-entry-smoke-secret-at-least-32-bytes";
const principalSessionToken = `iam_ps_${"b".repeat(43)}`;
const subjectIdentifier = "00000000-0000-4000-8000-000000000002";
const subjectAccessTransitionId = "10000000-0000-4000-8000-000000000002";
const entrySmoke = createProcessSmokeSuite({
  label: "Admin API entry",
  temporaryDirectoryPrefix: "iam-admin-api-entry-smoke-",
  hostname: "localhost",
});

afterEach(entrySmoke.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

function createEntryEnvironment(
  context: ProcessSmokeAttemptContext,
  redisPort: number,
) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_ADMIN_API_PORT: String(context.port),
      IAM_ADMIN_API_REDIS_HOST: "127.0.0.1",
      IAM_ADMIN_API_REDIS_PORT: String(redisPort),
      IAM_ADMIN_API_REDIS_DB: "15",
      IAM_ADMIN_API_LOG_LEVEL: "silent",
      IAM_ADMIN_API_LOG_FORMAT: "json",
      IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: `sess:admin-api-entry-smoke:${context.port}:`,
      IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_ID: lookupHmacId,
      IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: lookupHmacSecret,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

async function probeAdminApiDocs(origin: string, signal: AbortSignal) {
  const response = await fetch(`${origin}/admin/doc`, { signal });
  if (response.status !== 200) {
    throw new PortCollisionError(
      `port served an unexpected Admin API readiness status: expected 200, received ${response.status}`,
    );
  }

  let document: Record<string, unknown>;
  try {
    document = await response.json() as Record<string, unknown>;
  }
  catch (error) {
    throw new PortCollisionError("port did not serve the Admin API OpenAPI document", { cause: error });
  }
  const info = document.info;
  if (
    document.openapi !== "3.1.0"
    || typeof info !== "object"
    || info === null
    || (info as Record<string, unknown>).title !== "管理端API"
    || (info as Record<string, unknown>).version !== "1.0.0"
  ) {
    throw new PortCollisionError("port served an unexpected Admin API OpenAPI document");
  }
  return document;
}

async function probeSubjectAccessBoundary(origin: string, signal: AbortSignal) {
  const document = await probeAdminApiDocs(origin, signal);
  const response = await fetch(`${origin}/admin/users/entry-smoke`, {
    headers: {
      Client: "iam-admin",
      Cookie: `global_session=${principalSessionToken}`,
    },
    signal,
  });
  if (response.status !== 503) {
    throw new FatalReadinessError(
      `Admin API Subject Access boundary returned ${response.status} instead of 503`,
    );
  }
  const body = await response.json() as Record<string, unknown>;
  if (body.code !== ApiErrorCode.SubjectAccessUnavailable) {
    throw new FatalReadinessError(
      `Admin API Subject Access boundary returned unexpected code ${String(body.code)}`,
    );
  }
  return {
    body,
    document,
    setCookie: response.headers.get("set-cookie"),
  };
}

describe("Admin API entry", () => {
  test("runs the real production entry and fails closed through its admin Subject Access protocol", async () => {
    const redis = await createProcessSmokeRedisServer();
    try {
      const result = await entrySmoke.run({
        start(context) {
          seedProcessSmokePrincipalSession(redis, {
            externalToken: principalSessionToken,
            lookupHmacId,
            lookupHmacSecret,
            namespace: `sess:admin-api-entry-smoke:${context.port}:`,
            principalSessionId: "principal-session-admin-smoke",
            subjectAccessTransitionId,
            subjectIdentifier,
          });
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "src/index.ts"],
            cwd: adminApiRoot,
            env: createEntryEnvironment(context, redis.port),
          });
        },
        probe: (context, signal) =>
          probeSubjectAccessBoundary(entryOrigin(context), signal),
        childReadinessEvidence: context => `server: ${entryOrigin(context)}`,
      });

      expect(result.document).toMatchObject({
        openapi: "3.1.0",
        info: {
          title: "管理端API",
          version: "1.0.0",
        },
      });
      expect(result.body).toEqual({
        code: ApiErrorCode.SubjectAccessUnavailable,
        data: null,
        message: "账号访问状态暂时不可用",
      });
      expect(result.setCookie).toBeNull();
      expect(redis.commands).toContainEqual({
        name: "get",
        args: [`subject-access:v1:record:${subjectIdentifier}`],
      });
    }
    finally {
      await redis.close();
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
