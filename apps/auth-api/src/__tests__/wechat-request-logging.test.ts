import { expect, test } from "bun:test";
import { getWechatLoginLogPath } from "@auth-api/routes/sso/wechat-login-log-path";
import createApp from "@iam/api-core/core/create-app";
import { createRouter } from "@iam/api-core/core/create-router";
import { pino } from "pino";
import appConfig from "~auth-api/app.config";

test("API completion and error logs redact WeCom request handles, query and error details", async () => {
  const requestHandle = "wechat-desktop-request-handle";
  const flowHandle = "wechat-mobile-flow-handle";
  const oauthCode = "wechat-provider-authorization-code";
  const continuation = "oidc-return-handle";
  const cacheErrorSecret = "wx-code:legacy-secret-code";
  const entries: unknown[] = [];
  const logger = pino({ base: null }, { write: (line) => entries.push(JSON.parse(line)) });
  const sso = createRouter();
  sso.get("/wechat-qr/mobile/confirm/:flowId", (c) => c.text("OK"));
  sso.get("/third-party/wx", () => {
    throw new Error("WeChat callback cache unavailable", { cause: new Error(cacheErrorSecret) });
  });
  const auth = createRouter();
  auth.post("/wechat-qr/:requestId/complete", () => {
    throw new Error(`Could not continue ${continuation} in ${requestHandle}`);
  });
  const app = createApp(appConfig, {
    env: { NODE_ENV: "production" },
    logger,
    redactLogPath: getWechatLoginLogPath,
    routes: { "./routes/sso/index.ts": { default: sso }, "./routes/auth/index.ts": { default: auth } },
    middlewares: {},
  });

  const [confirm, complete, unmatched, legacy] = await Promise.all([
    app.request(`/sso/wechat-qr/mobile/confirm/${flowHandle}?code=${oauthCode}`),
    app.request(`/auth/%77echat-qr/${requestHandle}/complete?oidcReturn=${continuation}`, { method: "POST" }),
    app.request(`/auth/wechat-qr/${requestHandle}/unknown/${flowHandle}`),
    app.request("/sso/third-party/wx?code=legacy-secret-code"),
  ]);
  expect([confirm.status, complete.status, unmatched.status, legacy.status]).toEqual([200, 500, 404, 500]);
  for (const [path, statusCode] of [
    ["/sso/wechat-qr/mobile/confirm/:flowId", 200],
    ["/auth/wechat-qr/:requestId/complete", 500],
    ["/auth/wechat-qr/*", 404],
    ["/sso/third-party/wx", 500],
  ] as const) {
    expect(entries).toContainEqual(
      expect.objectContaining({ msg: "HTTP request completed", path, route: path, statusCode }),
    );
  }
  expect(entries).toContainEqual(
    expect.objectContaining({
      msg: "unhandled request error",
      path: "/auth/wechat-qr/:requestId/complete",
      route: "/auth/wechat-qr/:requestId/complete",
      statusCode: 500,
    }),
  );
  expect(entries).toContainEqual(
    expect.objectContaining({ msg: "unhandled request error", path: "/sso/third-party/wx", statusCode: 500 }),
  );
  const logged = JSON.stringify(entries);
  for (const value of [requestHandle, flowHandle, oauthCode, continuation, "legacy-secret-code"])
    expect(logged).not.toContain(value);
});
