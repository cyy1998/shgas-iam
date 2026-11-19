import { afterEach, describe, expect, test } from "bun:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { ProcessSmokeAttemptContext } from "@iam/test-support/process-smoke-harness";
import {
  createBoundedProcessLogCapture,
  createProcessSmokeSuite,
  PortCollisionError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/test-support/process-smoke-harness";
import { createEntryEnvironment } from "../support/api-env.fixture";

const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
const entrySmoke = createProcessSmokeSuite({
  label: "API entry",
  temporaryDirectoryPrefix: "iam-api-entry-smoke-",
  hostname: "localhost",
});

afterEach(entrySmoke.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

function startEntry(context: ProcessSmokeAttemptContext, nodeEnv: "development" | "production") {
  return spawnOwnedProcessTree({
    executable: process.execPath,
    args: ["--no-env-file", "run", "src/index.ts"],
    cwd: apiRoot,
    env: createEntryEnvironment(context, { NODE_ENV: nodeEnv }),
  });
}

async function probeApiDocs(origin: string, signal: AbortSignal) {
  const publicDocument = await readOpenApiDocument(`${origin}/public/doc`, "通用用户API", signal);
  const authDocument = await readOpenApiDocument(`${origin}/auth/doc`, "认证API", signal);
  const ssoDocument = await readOpenApiDocument(`${origin}/sso/doc`, "单点登录API", signal);
  const internalDocument = await readOpenApiDocument(`${origin}/internal/doc`, "内部API", signal);
  return { authDocument, internalDocument, publicDocument, ssoDocument };
}

async function readOpenApiDocument(url: string, expectedTitle: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (response.status !== 200) {
    throw new PortCollisionError(
      `port served an unexpected API readiness status: expected 200, received ${response.status}`,
    );
  }

  let document: Record<string, unknown>;
  try {
    document = (await response.json()) as Record<string, unknown>;
  } catch (error) {
    throw new PortCollisionError("port did not serve an API OpenAPI document", { cause: error });
  }
  const info = document.info;
  if (
    document.openapi !== "3.1.0" ||
    typeof info !== "object" ||
    info === null ||
    (info as Record<string, unknown>).title !== expectedTitle ||
    (info as Record<string, unknown>).version !== "1.0.0"
  ) {
    throw new PortCollisionError(`port served an unexpected ${expectedTitle} OpenAPI document`);
  }
  return document;
}

describe("API entry", () => {
  test(
    "starts in production with operational routes available and documentation closed",
    async () => {
      let capture: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
      const result = await entrySmoke.run({
        start: (context) => {
          const child = startEntry(context, "production");
          capture = createBoundedProcessLogCapture(child, { maxBytes: 128 * 1024 });
          return child;
        },
        async probe(context, signal) {
          const origin = entryOrigin(context);
          const paths = [
            "/",
            "/doc",
            "/public/doc",
            "/open/doc",
            "/internal/doc",
            "/sso/doc",
            "/auth/doc",
            "/oidc/doc",
          ];
          const docsStatuses = Object.fromEntries(
            await Promise.all(
              paths.map(async (path) => {
                const response = await fetch(`${origin}${path}`, {
                  headers: { Client: "iam", "X-IAM-Entry-Network": "external" },
                  signal,
                });
                await response.body?.cancel();
                return [path, response.status] as const;
              }),
            ),
          );
          const [health, ready, protocol, dependency] = await Promise.all([
            fetch(`${origin}/oidc/health`, { signal }),
            fetch(`${origin}/ready`, { signal }),
            fetch(`${origin}/oidc/auth`, {
              method: "POST",
              headers: { "X-IAM-Entry-Network": "external", "Content-Type": "application/json" },
              body: "{}",
              signal,
            }),
            fetch(
              `${origin}/oidc/auth?client_id=fixture-client&response_type=code&redirect_uri=https%3A%2F%2Frp.example%2Fcallback&scope=openid&state=private-state`,
              { headers: { "X-IAM-Entry-Network": "external" }, signal },
            ),
          ]);
          return {
            docsStatuses,
            health: health.status,
            ready: ready.status,
            protocol: { status: protocol.status, body: await protocol.json() },
            dependency: {
              status: dependency.status,
              body: await dependency.json(),
              retryAfter: dependency.headers.get("Retry-After"),
            },
          };
        },
        childReadinessEvidence: (context) => `server: ${entryOrigin(context)}`,
      });

      const logs = capture?.snapshot() ?? "";
      capture?.dispose();
      expect(result.docsStatuses).toEqual({
        "/": 404,
        "/doc": 404,
        "/public/doc": 401, // The Public tier still requires a session.
        "/open/doc": 404,
        "/internal/doc": 401, // The Internal tier still requires client authentication.
        "/sso/doc": 404,
        "/auth/doc": 404,
        "/oidc/doc": 404,
      });
      expect(result.health).toBe(503);
      expect(result.ready).toBe(503);
      expect(result.protocol).toMatchObject({ status: 400, body: { error: "invalid_request" } });
      expect(result.dependency).toMatchObject({
        status: 503,
        retryAfter: "3",
        body: { error: "temporarily_unavailable" },
      });
      expect(logs).toContain('"event":"oidc_protocol_error"');
      expect(logs).toContain('"event":"oidc_server_error"');
      expect(logs).not.toContain("private-state");
    },
    PROCESS_SMOKE_TEST_TIMEOUT_MS,
  );

  test(
    "serves Scalar and canonical OpenAPI routes in development",
    async () => {
      const result = await entrySmoke.run({
        start: (context) => startEntry(context, "development"),
        async probe(context, signal) {
          const origin = entryOrigin(context);
          const docs = await probeApiDocs(origin, signal);
          const page = await fetch(`${origin}/`, { signal });
          return { ...docs, scalar: { status: page.status, html: await page.text() } };
        },
        childReadinessEvidence: (context) => `server: ${entryOrigin(context)}`,
      });

      expect(result.scalar.status).toBe(200);
      expect(result.scalar.html).toContain("/public/doc");
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
        components: {
          securitySchemes: {
            CustomSsoBasic: {
              type: "http",
              scheme: "basic",
              description:
                "Basic username is the UTF-8 percent-encoded Client Code; password is the Custom SSO Client Secret.",
            },
          },
        },
        paths: {
          "/sso/token": {
            post: {
              security: [{ CustomSsoBasic: [] }],
              requestBody: { content: { "application/x-www-form-urlencoded": expect.any(Object) } },
            },
          },
        },
      });
      expect(result.ssoDocument.paths).not.toHaveProperty(["/sso/token", "get"]);
      expect(result.internalDocument.paths).toMatchObject({
        "/internal/users/:username": { get: expect.any(Object) },
        "/internal/users/search-dsl": { post: expect.any(Object) },
      });
    },
    PROCESS_SMOKE_TEST_TIMEOUT_MS,
  );
});
