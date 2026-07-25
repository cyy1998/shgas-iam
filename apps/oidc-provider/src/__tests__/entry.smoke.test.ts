import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  PortCollisionError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it } from "vitest";

const oidcRoot = fileURLToPath(new URL("../../", import.meta.url));
const entryListeningEvidence = "OIDC provider listening";
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
) {
  const origin = entryOrigin(context);
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_OIDC_PROVIDER_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_OIDC_PROVIDER_REDIS_HOST: "127.0.0.1",
      IAM_OIDC_PROVIDER_REDIS_PORT: "1",
      IAM_OIDC_PROVIDER_PORT: String(context.port),
      IAM_OIDC_PROVIDER_LOG_FORMAT: "json",
      IAM_OIDC_PROVIDER_ISSUER: `${origin}/oidc`,
      IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: origin,
      IAM_OIDC_PROVIDER_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
      IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: currentJwkJson,
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

describe("oIDC provider entry", () => {
  it("starts through the tsx loader, parsed environment, and real composition root", async () => {
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

    const discovery = await entrySmoke.run({
      start(context) {
        return spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--import", "tsx", "src/index.ts"],
          cwd: oidcRoot,
          env: createEntryEnvironment(context, currentJwkJson),
        });
      },
      probe(context, signal) {
        const origin = entryOrigin(context);
        return probeDiscovery(origin, `${origin}/oidc`, signal);
      },
      childReadinessEvidence: entryListeningEvidence,
    });

    expect(discovery).toMatchObject({
      issuer: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/oidc$/u),
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
