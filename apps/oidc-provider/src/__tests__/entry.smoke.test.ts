import type { ProcessSmokeChild } from "./process-smoke-harness.ts";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import {
  PortCollisionError,
  recoverFromPortCollision,
  runProcessSmoke,
  spawnOwnedProcessTree,
  terminateProcessTree,
  withOwnedTemporaryDirectory,
} from "./process-smoke-harness.ts";

const oidcRoot = fileURLToPath(new URL("../../", import.meta.url));
const children = new Set<ProcessSmokeChild>();
const entryReadyTimeoutMs = 30_000;
const entryCleanupTimeoutMs = 5_000;
const entryTempCleanupTimeoutMs = 5_000;
const entrySmokeTimeoutMs = 45_000;
const maxPortAllocationAttempts = 3;
const entryListeningEvidence = "OIDC provider listening";

afterEach(async () => {
  const activeChildren = [...children];
  children.clear();
  const cleanupResults = await Promise.allSettled(activeChildren.map(child =>
    terminateProcessTree(child, { timeoutMs: entryCleanupTimeoutMs })));
  const cleanupFailures = cleanupResults
    .filter(result => result.status === "rejected")
    .map(result => result.reason);
  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      cleanupFailures,
      `OIDC entry runner cleanup failed for ${cleanupFailures.length} child process(es)`,
    );
  }
});

async function reservePort() {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  if (address === null || typeof address === "string")
    throw new Error("failed to reserve OIDC smoke port");
  await new Promise<void>((resolve, reject) =>
    reservation.close(error => error ? reject(error) : resolve()));
  return address.port;
}

function createEntryEnvironment(
  port: number,
  currentJwkJson: string,
  temporaryDirectory: string,
) {
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    issuer: `${origin}/oidc`,
    env: {
      ...process.env,
      NODE_ENV: "test",
      IAM_OIDC_PROVIDER_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_OIDC_PROVIDER_REDIS_HOST: "127.0.0.1",
      IAM_OIDC_PROVIDER_REDIS_PORT: "1",
      IAM_OIDC_PROVIDER_PORT: String(port),
      IAM_OIDC_PROVIDER_LOG_FORMAT: "json",
      IAM_OIDC_PROVIDER_ISSUER: `${origin}/oidc`,
      IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: origin,
      IAM_OIDC_PROVIDER_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
      IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: currentJwkJson,
      TEMP: temporaryDirectory,
      TMP: temporaryDirectory,
      TMPDIR: temporaryDirectory,
    },
  };
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

async function runEntryAttempt(
  attemptNumber: number,
  currentJwkJson: string,
) {
  return await withOwnedTemporaryDirectory({
    prefix: "iam-oidc-entry-smoke-",
    cleanupTimeoutMs: entryTempCleanupTimeoutMs,
    async run(temporaryDirectory) {
      const port = await reservePort();
      const runtime = createEntryEnvironment(
        port,
        currentJwkJson,
        temporaryDirectory,
      );
      return await runProcessSmoke({
        label: `OIDC provider entry attempt ${attemptNumber}`,
        start() {
          const child = spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--import", "tsx", "src/index.ts"],
            cwd: oidcRoot,
            env: runtime.env,
          });
          children.add(child);
          return child;
        },
        probe: signal => probeDiscovery(runtime.origin, runtime.issuer, signal),
        childReadinessEvidence: entryListeningEvidence,
        readinessTimeoutMs: entryReadyTimeoutMs,
        cleanupTimeoutMs: entryCleanupTimeoutMs,
        async stop(child) {
          await terminateProcessTree(child, {
            timeoutMs: entryCleanupTimeoutMs,
          });
          children.delete(child);
        },
      });
    },
  });
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

    const discovery = await recoverFromPortCollision(
      attemptNumber => runEntryAttempt(attemptNumber, currentJwkJson),
      { maxAttempts: maxPortAllocationAttempts },
    );

    expect(discovery).toMatchObject({
      issuer: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/oidc$/u),
    });
  }, entrySmokeTimeoutMs);
});
