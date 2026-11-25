import { afterEach, expect, test } from "bun:test";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { requireExternalTestUrl } from "@iam/test-support/external-test-resources";
import {
  createBoundedProcessLogCapture,
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
  terminateProcessTree,
} from "@iam/test-support/process-smoke-harness";
import { signingKeys } from "../../src/testing/oidc-signing.fixture";
import { useApiPostgresTestHarness } from "../support/postgres-test-file.fixture";

const getDatabase = useApiPostgresTestHarness();
const suite = createProcessSmokeSuite({
  label: "SSO API production entry",
  temporaryDirectoryPrefix: "iam-sso-api-entry-",
  hostname: "localhost",
});
afterEach(suite.cleanup);

const redisUrl = requireExternalTestUrl({
  environment: process.env,
  lane: "SSO API entry",
  name: "IAM_SSO_API_TEST_REDIS_URL",
});

test.each(["production", "development"] as const)(
  "starts with protocol settings alone in %s, checks dependencies and stops on SIGTERM",
  async (nodeEnv) => {
    let capture: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
    try {
      const result = await suite.run({
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
                NODE_ENV: nodeEnv,
                IAM_SSO_API_PORT: String(context.port),
                IAM_SSO_API_DATABASE_URL: getDatabase().databaseUrl,
                IAM_SSO_API_REDIS_URL: redisUrl,
                IAM_SSO_API_SSO_INTERNAL_ORIGIN: origin,
                IAM_SSO_API_SSO_EXTERNAL_ORIGIN: "https://external.example.test",
                IAM_SSO_API_OIDC_CURRENT_JWK_JSON: signingKeys(),
                IAM_SSO_API_LOG_FORMAT: "json",
              },
            }),
          });
          capture = createBoundedProcessLogCapture(child, { maxBytes: 32 * 1024 });
          return child;
        },
        async stop(child) {
          if (process.platform === "win32" || child.exitCode !== null || child.signalCode !== null) {
            await terminateProcessTree(child, { timeoutMs: 5_000 });
            return;
          }
          const closed = once(child, "close", { signal: AbortSignal.timeout(8_000) });
          child.kill("SIGTERM");
          const [code, signal] = await closed;
          expect({ code, signal }).toEqual({ code: 0, signal: null });
        },
        childReadinessEvidence: (context) => `server: http://${context.hostname}:${context.port}`,
        async probe(context, signal) {
          const origin = `http://${context.hostname}:${context.port}`;
          const ready = await fetch(`${origin}/ready`, { signal, headers: { Connection: "close" } });
          const readiness = { status: ready.status, body: await ready.json() };
          if (readiness.status !== 200) return undefined;
          const health = await fetch(`${origin}/health`, { signal, headers: { Connection: "close" } });
          const oidc = await fetch(`${origin}/oidc/health`, { signal });
          const discovery = await fetch(`${origin}/oidc/.well-known/openid-configuration`, {
            signal,
            headers: { "X-IAM-Entry-Network": "internal" },
          });
          const ssoDocs = await fetch(`${origin}/sso/doc`, { signal });
          const oidcDocs = await fetch(`${origin}/oidc/doc`, {
            signal,
            headers: { "X-IAM-Entry-Network": "internal" },
          });
          const retired = await Promise.all(
            [
              "/auth/login/password",
              "/sso/thirdparty/oa",
              "/sso/third-party/wx",
              "/sso/wechat-qr",
              "/oidc/wechat-qr",
            ].map(async (path) => {
              const response = await fetch(`${origin}${path}`, {
                method: path === "/auth/login/password" || path.endsWith("/wechat-qr") ? "POST" : "GET",
                headers: { "X-IAM-Entry-Network": "internal" },
                signal,
              });
              await response.body?.cancel();
              return response.status;
            }),
          );
          return {
            readiness,
            retired,
            ssoDocs: { status: ssoDocs.status, body: await ssoDocs.json() },
            oidcDocs: { status: oidcDocs.status, body: await oidcDocs.json() },
            health: { status: health.status, body: await health.json() },
            oidc: { status: oidc.status, body: await oidc.json() },
            issuer: ((await discovery.json()) as { issuer: string }).issuer,
            origin,
          };
        },
      });
      expect(result).toMatchObject({
        readiness: { status: 200, body: { status: "ok" } },
        health: { status: 200, body: { status: "ok" } },
        oidc: { status: 200, body: { status: "ok" } },
        issuer: `${result.origin}/oidc`,
        retired: [404, 404, 404, 404, 404],
      });
      if (nodeEnv === "development") {
        expect(result.ssoDocs).toMatchObject({
          status: 200,
          body: {
            openapi: "3.1.0",
            paths: {
              "/sso/token": { post: expect.any(Object) },
              "/sso/authz": { get: expect.any(Object) },
              "/sso/user-info": { get: expect.any(Object) },
            },
          },
        });
        expect(result.oidcDocs).toMatchObject({
          status: 200,
          body: {
            openapi: "3.1.0",
            paths: {
              "/oidc/.well-known/openid-configuration": { get: expect.any(Object) },
              "/oidc/token": { post: expect.any(Object) },
              "/oidc/session/end": { get: expect.any(Object), post: expect.any(Object) },
            },
          },
        });
      } else {
        expect(result.ssoDocs.status).toBe(404);
        expect(result.oidcDocs.status).toBe(404);
      }
      const logs = capture?.snapshot() ?? "";
      expect(logs).toContain('"sourceApp":"sso-api"');
      if (process.platform !== "win32") expect(logs).toContain('"event":"sso.api.stopped"');
    } finally {
      capture?.dispose();
    }
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);
