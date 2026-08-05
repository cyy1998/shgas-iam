import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
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
  seedProcessSmokeCredential,
} from "@iam/api-core/testing/process-smoke-redis-server";
import { exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it } from "vitest";

const oidcProviderRoot = fileURLToPath(new URL("../../", import.meta.url));
const entryListeningEvidence = "OIDC provider listening";
const lookupHmacId = "entry-smoke";
const lookupHmacSecret = "oidc-entry-smoke-secret-that-is-at-least-32-bytes";
const accessToken = `iam_cr_${"c".repeat(43)}`;
const subjectIdentifier = "00000000-0000-4000-8000-000000000003";
const subjectAccessTransitionId = "10000000-0000-4000-8000-000000000003";
const entrySmoke = createProcessSmokeSuite({
  label: "OIDC provider entry",
  temporaryDirectoryPrefix: "iam-oidc-entry-smoke-",
  hostname: "127.0.0.1",
});

afterEach(entrySmoke.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

function createEntryEnvironment(
  context: ProcessSmokeAttemptContext,
  currentJwkJson: string,
  options: {
    databaseUrl: string;
    redis: {
      db?: number;
      host: string;
      password?: string;
      port: number;
    };
    sessionKernelNamespace?: string;
  },
) {
  const origin = entryOrigin(context);
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_OIDC_PROVIDER_DATABASE_URL: options.databaseUrl,
      IAM_OIDC_PROVIDER_REDIS_HOST: options.redis.host,
      IAM_OIDC_PROVIDER_REDIS_PORT: String(options.redis.port),
      IAM_OIDC_PROVIDER_REDIS_PASSWORD: options.redis.password,
      IAM_OIDC_PROVIDER_REDIS_DB: String(options.redis.db ?? 0),
      IAM_OIDC_PROVIDER_PORT: String(context.port),
      IAM_OIDC_PROVIDER_LOG_FORMAT: "json",
      IAM_OIDC_PROVIDER_ISSUER: `${origin}/oidc`,
      IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: origin,
      IAM_OIDC_PROVIDER_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
      IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: currentJwkJson,
      IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE: options.sessionKernelNamespace
        ?? `sess:oidc-entry-smoke:${context.port}:`,
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_ID: lookupHmacId,
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET: lookupHmacSecret,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
}

async function probeDiscovery(origin: string, issuer: string, signal: AbortSignal) {
  const response = await fetch(
    `${origin}/oidc/.well-known/openid-configuration`,
    { signal },
  );
  if (response.status !== 200)
    return undefined;
  const discovery = await response.json() as Record<string, unknown>;
  if (discovery.issuer !== issuer) {
    throw new PortCollisionError(
      `port served an unexpected issuer: expected ${issuer}, received ${String(discovery.issuer)}`,
    );
  }
  return discovery;
}

async function probeSubjectAccessBoundary(
  origin: string,
  issuer: string,
  signal: AbortSignal,
) {
  const discovery = await probeDiscovery(origin, issuer, signal);
  if (discovery === undefined)
    return undefined;
  const response = await fetch(`${issuer}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (response.status !== 503) {
    throw new FatalReadinessError(
      `OIDC Subject Access boundary returned ${response.status} instead of 503`,
    );
  }
  const body = await response.json() as Record<string, unknown>;
  if (body.error !== "temporarily_unavailable") {
    throw new FatalReadinessError(
      `OIDC Subject Access boundary returned unexpected error ${String(body.error)}`,
    );
  }
  return {
    body,
    discovery,
    setCookie: response.headers.get("set-cookie"),
  };
}

describe("oIDC provider entry", () => {
  it("runs the real production entry and fails closed through its UserInfo Subject Access protocol", async () => {
    const { privateKey } = await generateKeyPair(
      "RS256",
      { modulusLength: 2048, extractable: true },
    );
    const currentJwkJson = JSON.stringify({
      ...await exportJWK(privateKey),
      alg: "RS256",
      kid: "entry-smoke",
      use: "sig",
    });

    const redis = await createProcessSmokeRedisServer();
    try {
      const result = await entrySmoke.run({
        start(context) {
          seedProcessSmokeCredential(redis, {
            clientCode: "entry-smoke-client",
            credentialId: "credential-oidc-smoke",
            credentialType: "access_token",
            externalToken: accessToken,
            lookupHmacId,
            lookupHmacSecret,
            namespace: `sess:oidc-entry-smoke:${context.port}:`,
            principalSessionId: "principal-session-oidc-smoke",
            protocol: "oidc",
            subjectAccessTransitionId,
            subjectIdentifier,
          });
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--import", "tsx", "src/index.ts"],
            cwd: oidcProviderRoot,
            env: createEntryEnvironment(context, currentJwkJson, {
              databaseUrl: "postgresql://iam:password@127.0.0.1:1/iam",
              redis: {
                host: "127.0.0.1",
                port: redis.port,
              },
            }),
          });
        },
        probe(context, signal) {
          const origin = entryOrigin(context);
          return probeSubjectAccessBoundary(
            origin,
            `${origin}/oidc`,
            signal,
          );
        },
        childReadinessEvidence: entryListeningEvidence,
      });

      expect(result.discovery).toMatchObject({
        issuer: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/oidc$/u),
      });
      expect(result.body).toEqual({ error: "temporarily_unavailable" });
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
