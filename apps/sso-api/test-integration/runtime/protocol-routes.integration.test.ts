import { expect, test } from "bun:test";
import { createSsoApiApp } from "../../src/app";
import { parseSsoApiEnv } from "../../src/env";
import { createEntryEnvironment } from "../support/api-env.fixture";
import { useApiPostgresTestHarness } from "../support/postgres-test-file.fixture";

const getDatabase = useApiPostgresTestHarness();
const origin = "http://127.0.0.1:3000";

test.each(["production", "development"])("SSO API protocol route surface in %s", async (nodeEnv) => {
  const env = parseSsoApiEnv(
    createEntryEnvironment(
      { hostname: "127.0.0.1", port: 3000, temporaryDirectory: "/tmp" },
      {
        NODE_ENV: nodeEnv,
        IAM_SSO_API_DATABASE_URL: getDatabase().databaseUrl,
        IAM_SSO_API_REDIS_URL: process.env.IAM_TEST_REDIS_URL,
        IAM_SSO_API_LOG_LEVEL: "silent",
      },
    ),
  );
  const { app, close } = await createSsoApiApp({ env });
  try {
    const request = (path: string, method = "GET") =>
      app.fetch(
        new Request(origin + path, {
          method,
          headers: { "X-IAM-Entry-Network": "internal" },
        }),
      );
    for (const [path, method] of [
      ["/auth/login/password", "POST"],
      ["/sso/thirdparty/oa", "GET"],
      ["/sso/third-party/wx", "GET"],
      ["/sso/wechat-qr", "POST"],
      ["/oidc/wechat-qr", "POST"],
    ] as const) {
      const retired = await request(path, method);
      expect(retired.status).toBe(404);
    }
    for (const path of ["/health", "/oidc/health"]) {
      const health = await request(path);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "ok" });
    }
    const discovery = await request("/oidc/.well-known/openid-configuration");
    expect(await discovery.json()).toMatchObject({ issuer: `${origin}/oidc` });
    const sso = await request("/sso/doc");
    const oidc = await request("/oidc/doc");
    if (nodeEnv === "production") {
      expect(sso.status).toBe(404);
      expect(oidc.status).toBe(404);
      return;
    }
    expect(sso.status).toBe(200);
    expect(await sso.json()).toMatchObject({
      openapi: "3.1.0",
      paths: {
        "/sso/token": { post: expect.any(Object) },
        "/sso/authz": { get: expect.any(Object) },
        "/sso/user-info": { get: expect.any(Object) },
      },
    });
    expect(oidc.status).toBe(200);
    expect(await oidc.json()).toMatchObject({
      openapi: "3.1.0",
      paths: {
        "/oidc/.well-known/openid-configuration": { get: expect.any(Object) },
        "/oidc/token": { post: expect.any(Object) },
        "/oidc/session/end": { get: expect.any(Object), post: expect.any(Object) },
      },
    });
  } finally {
    await close();
  }
});
