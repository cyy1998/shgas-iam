import { Buffer } from "node:buffer";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { E2ERunContext } from "./src/e2e-context.ts";
import { test } from "./src/gateway-test.ts";
import { createPkceS256Pair } from "./src/oidc-rp.ts";

test.beforeEach(({ runtime }) => {
  expect(new URL(runtime.internalOrigin).hostname).not.toBe(new URL(runtime.origin).hostname);
});

// The worker maps only test-owned DNS names. Canonical URLs retain native Cookie/Host semantics.
function gatewayRequest(
  request: APIRequestContext,
  origin: string,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1] = {},
) {
  const target = new URL(path, origin);
  return request.fetch(target.href, { ...options, maxRedirects: 0 });
}

async function login(page: Page, origin: string, runtime: E2ERunContext) {
  await expect(page).toHaveURL((url) => url.origin === origin && url.pathname === "/portal/login");
  await page.getByLabel("工号 / 账号").fill(runtime.references.adminUsername);
  await page.getByPlaceholder("请输入登录密码").fill(runtime.adminPassword);
  await page.getByRole("button", { name: "安全登录" }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();
}

for (const entry of ["internal", "external"] as const) {
  test(`${entry} APISIX replaces forged entry headers and preserves configured Discovery identity`, async ({
    request,
    runtime,
  }) => {
    const entryOrigin = entry === "internal" ? runtime.internalOrigin : runtime.origin;
    const response = await gatewayRequest(
      request,
      entryOrigin,
      "/oidc/.well-known/openid-configuration?issuer=https://attacker.example",
      {
        headers: {
          "X-IAM-Entry-Network": entry === "internal" ? "external" : "internal",
          "X-Forwarded-Host": "attacker.example",
          Forwarded: "host=attacker.example;proto=https",
        },
      },
    );
    expect(response.status()).toBe(200);
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: `${entryOrigin}/oidc`,
      authorization_endpoint: `${entryOrigin}/oidc/auth`,
      token_endpoint: `${entryOrigin}/oidc/token`,
      userinfo_endpoint: `${entryOrigin}/oidc/me`,
      jwks_uri: `${entryOrigin}/oidc/jwks`,
      end_session_endpoint: `${entryOrigin}/oidc/session/end`,
      authorization_response_iss_parameter_supported: true,
    });
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  for (const logoutMode of ["cancel", "confirm"] as const) {
    test(`${entry} OIDC browser keeps entry and issuer through ${logoutMode} logout`, async ({
      page,
      request,
      runtime,
    }) => {
      const entryOrigin = entry === "internal" ? runtime.internalOrigin : runtime.origin;
      const clientId = `${runtime.references.oidcClientCode}-dual`;
      const redirectUri = runtime.references.oidcRedirectUri;
      const pkce = createPkceS256Pair();
      const state = `dual-entry-${entry}`;
      const authorization = new URL("/oidc/auth", entryOrigin);
      authorization.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid profile",
        state,
        nonce: state,
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
      }).toString();
      const navigation = page.waitForResponse((response) => new URL(response.url()).pathname === "/oidc/auth");
      await page.goto(authorization.href);
      const first = await navigation;
      expect(first.headers().location).toMatch(/^\/portal\/login\?/u);
      const interaction = (await page.context().cookies(entryOrigin)).find(
        (cookie) => cookie.name === "oidc_interaction_binding",
      );
      expect(interaction).toMatchObject({
        domain: new URL(entryOrigin).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      });
      const completion = page.waitForResponse((response) => new URL(response.url()).pathname === "/oidc/resume");
      await login(page, entryOrigin, runtime);
      expect(await (await completion).headerValue("set-cookie")).toMatch(
        /oidc_login_completion=[^\r\n]*; Path=\/oidc;/u,
      );
      await expect(page).toHaveURL(
        (url) => url.origin === runtime.origin && url.pathname === "/e2e/oidc/callback" && url.searchParams.has("code"),
      );
      const callback = new URL(page.url());
      expect(callback.searchParams.get("iss")).toBe(`${entryOrigin}/oidc`);
      expect(callback.searchParams.get("state")).toBe(state);
      const root = (await page.context().cookies(entryOrigin)).find((cookie) => cookie.name === "global_session");
      expect(root).toMatchObject({
        domain: new URL(entryOrigin).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      });
      const other = entry === "internal" ? runtime.origin : runtime.internalOrigin;
      if (other !== entryOrigin)
        expect(
          (await page.context().cookies(other)).find((cookie) => cookie.name === "global_session"),
        ).toBeUndefined();
      const tokenResponse = await gatewayRequest(request, entryOrigin, "/oidc/token", {
        method: "POST",
        form: {
          client_id: clientId,
          grant_type: "authorization_code",
          code: callback.searchParams.get("code")!,
          redirect_uri: redirectUri,
          code_verifier: pkce.verifier,
        },
      });
      expect(tokenResponse.status()).toBe(200);
      const tokens = await tokenResponse.json();
      const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"));
      expect(claims).toMatchObject({ iss: `${entryOrigin}/oidc`, aud: clientId, nonce: state });
      const userInfo = () =>
        gatewayRequest(request, entryOrigin, "/oidc/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
      const beforeLogout = await userInfo();
      expect(beforeLogout.status()).toBe(200);
      expect(await beforeLogout.json()).toMatchObject({
        sub: claims.sub,
        preferred_username: runtime.references.adminUsername,
      });
      const logoutPage = await page.goto(`${entryOrigin}/oidc/session/end`);
      const logoutCookies = await logoutPage?.headerValues("set-cookie");
      for (const name of ["oidc_logout_binding", "oidc_logout_request"]) {
        expect(logoutCookies?.find((cookie) => cookie.startsWith(`${name}=`))).toContain("Path=/oidc/session/end;");
      }
      const confirmation = page.waitForResponse((response) => {
        const target = new URL(response.url());
        return (
          response.request().method() === "POST" &&
          target.origin === entryOrigin &&
          target.pathname === "/oidc/session/end/confirm"
        );
      });
      await page
        .getByRole("button", { name: logoutMode === "cancel" ? "No, stay signed in" : "Yes, sign me out" })
        .click();
      expect([302, 303]).toContain((await confirmation).status());
      await expect(page).toHaveURL(`${entryOrigin}/oidc/session/end/success`);
      const after = await userInfo();
      expect(after.status()).toBe(logoutMode === "cancel" ? 200 : 401);
      const retainedRoot = (await page.context().cookies(entryOrigin)).find(
        (cookie) => cookie.name === "global_session",
      );
      if (logoutMode === "cancel") expect(retainedRoot?.value).toBe(root?.value);
      else expect(retainedRoot).toBeUndefined();
    });
  }
  test(`${entry} Custom browser derives the managed callback from its landing origin`, async ({
    page,
    request,
    runtime,
  }) => {
    const entryOrigin = entry === "internal" ? runtime.internalOrigin : runtime.origin;
    const customClient = `${runtime.references.customSsoClientCode}-dual`;
    const destination = `${entryOrigin}/e2e/custom-sso/callback?view=orders&filter=a%2Bb`;
    const state = `managed-${entry}`;
    const authorization = new URL("/sso/authorize", entryOrigin);
    authorization.search = new URLSearchParams({ client: customClient, redirectUrl: destination, state }).toString();
    const firstResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/sso/authorize");
    await page.goto(authorization.href);
    expect((await firstResponse).headers().location).toMatch(/^\/portal\/login\?/u);
    const managedCallback = page.waitForRequest((request) => new URL(request.url()).pathname === "/sso/callback");
    const landingResponse = page.waitForResponse(
      (response) =>
        response.request().isNavigationRequest() &&
        new URL(response.url()).origin === entryOrigin &&
        new URL(response.url()).pathname === "/e2e/custom-sso/callback",
    );
    await login(page, entryOrigin, runtime);
    const actualCallback = new URL((await managedCallback).url());
    expect(actualCallback.origin).toBe(entryOrigin);
    expect(actualCallback.pathname).toBe("/sso/callback");
    expect(actualCallback.searchParams.get("client")).toBe(customClient);
    expect(actualCallback.searchParams.get("code")).toBeTruthy();
    expect(actualCallback.searchParams.get("redirectUrl")).toBe(destination);
    await expect(page).toHaveURL(
      (url) =>
        url.origin === entryOrigin && url.pathname === "/e2e/custom-sso/callback" && url.searchParams.has("token"),
    );
    expect((await landingResponse).status()).toBe(200);
    const final = new URL(page.url());
    expect(final.searchParams.get("state")).toBe(state);
    const token = final.searchParams.get("token")!;
    expect(token).toBeTruthy();
    final.searchParams.delete("state");
    final.searchParams.delete("token");
    expect(final.href).toBe(destination);
    const roots = (await page.context().cookies()).filter((cookie) => cookie.name === "global_session");
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      domain: new URL(entryOrigin).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });
    const other = entry === "internal" ? runtime.origin : runtime.internalOrigin;
    if (other !== entryOrigin)
      expect((await page.context().cookies(other)).find((cookie) => cookie.name === "global_session")).toBeUndefined();
    const localCookieName = `local_${customClient}_session`;
    expect((await page.context().cookies(entryOrigin)).find((cookie) => cookie.name === localCookieName)).toMatchObject(
      {
        value: token,
        domain: new URL(entryOrigin).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    );
    if (other !== entryOrigin)
      expect((await page.context().cookies(other)).find((cookie) => cookie.name === localCookieName)).toBeUndefined();
    const userInfo = () =>
      gatewayRequest(request, entryOrigin, "/api/iam/sso/user-info", {
        headers: { Authorization: token, Client: customClient },
      });
    const before = await userInfo();
    expect(before.status()).toBe(200);
    expect(await before.json()).toMatchObject({
      data: { profile: { username: runtime.references.adminUsername } },
    });
    await page.goto(`${entryOrigin}/sso/logout?${new URLSearchParams({ redirectUrl: `${entryOrigin}/portal/login` })}`);
    await expect(page).toHaveURL(`${entryOrigin}/portal/login`);
    const after = await userInfo();
    expect(after.status()).toBe(401);
    expect(
      (await page.context().cookies(entryOrigin)).find((cookie) => cookie.name === "global_session"),
    ).toBeUndefined();
  });

  test(`${entry} business callback stays registered and exchanges its Code through APISIX`, async ({
    page,
    request,
    runtime,
  }) => {
    const entryOrigin = entry === "internal" ? runtime.internalOrigin : runtime.origin;
    const businessClient = `${runtime.references.customSsoClientCode}-business`;
    const destination = `${entryOrigin}/e2e/business/landing?view=orders`;
    const state = `business-${entry}`;
    await page.goto(
      `${entryOrigin}/sso/authorize?${new URLSearchParams({ client: businessClient, redirectUrl: destination, state })}`,
    );
    const callbackResponse = page.waitForResponse(
      (response) =>
        response.request().isNavigationRequest() &&
        new URL(response.url()).origin === runtime.origin &&
        new URL(response.url()).pathname === "/e2e/business/callback",
    );
    await login(page, entryOrigin, runtime);
    await expect(page).toHaveURL(
      (url) =>
        url.origin === runtime.origin && url.pathname === "/e2e/business/callback" && url.searchParams.has("code"),
    );
    expect((await callbackResponse).status()).toBe(200);
    const callback = new URL(page.url());
    expect(callback.searchParams.get("registered")).toBe("1");
    expect(callback.searchParams.get("redirectUrl")).toBe(destination);
    expect(callback.searchParams.get("client")).toBe(businessClient);
    expect(callback.searchParams.get("state")).toBe(state);
    expect(callback.searchParams.has("token")).toBe(false);
    const exchanged = await gatewayRequest(request, entryOrigin, "/sso/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${businessClient}:e2e-business-secret-local-only`).toString("base64")}`,
      },
      form: { code: callback.searchParams.get("code")!, redirect_uri: destination },
    });
    expect(exchanged.status()).toBe(200);
    const result = await exchanged.json();
    expect(result.data.sid).toBeTruthy();
    expect(result.data.ttl).toBeGreaterThan(0);
    const userInfo = await gatewayRequest(request, entryOrigin, "/api/iam/sso/user-info", {
      headers: { Authorization: result.data.sid, Client: businessClient },
    });
    expect(userInfo.status()).toBe(200);
    expect(await userInfo.json()).toMatchObject({
      data: { profile: { username: runtime.references.adminUsername } },
    });
    const landingResponse = await page.goto(destination);
    expect(landingResponse?.status()).toBe(200);
    await expect(page).toHaveURL(destination);
  });
}

for (const path of ["/oidc/.well-known/openid-configuration", "/sso/.well-known/authentication-configuration"]) {
  test(`unknown authority cannot select an issuer at ${path}`, async ({ request, runtime }) => {
    const unknown = new URL(runtime.origin);
    unknown.hostname = "unknown.iam.localhost";
    const response = await gatewayRequest(request, unknown.origin, path, {
      headers: { "X-IAM-Entry-Network": "internal" },
    });
    expect(response.status()).toBe(404);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });
}

test("configured entry metadata uses shared JWKS without merging distinct issuer identities", async ({
  request,
  runtime,
}) => {
  const internal = await gatewayRequest(request, runtime.internalOrigin, "/oidc/jwks");
  const external = await gatewayRequest(request, runtime.origin, "/oidc/jwks");
  expect(internal.status()).toBe(200);
  expect(external.status()).toBe(200);
  const internalKeys = await internal.json();
  expect(internalKeys.keys.length).toBeGreaterThan(0);
  expect(internalKeys).toEqual(await external.json());
});

test("APISIX preserves M2M authentication on the canonical path and compatibility alias", async ({
  request,
  runtime,
}) => {
  for (const origin of [runtime.internalOrigin, runtime.origin]) {
    for (const [apikey, status] of [
      [runtime.internalApiKey, 200],
      ["invalid", 401],
    ] as const) {
      const headers = { apikey };
      const canonical = await gatewayRequest(request, origin, "/api/iam/internal/authz", { headers });
      expect(canonical.status()).toBe(status);
      const body = await canonical.json();
      for (const path of ["/api/iam/auth/internal-authz", "/api/iam/auth/internal-authz/"]) {
        const legacy = await gatewayRequest(request, origin, path, { headers });
        expect(legacy.status()).toBe(status);
        expect(await legacy.json()).toEqual(body);
      }
    }
  }
});

test("APISIX routes the fixed OA and WeCom callbacks on both entry hosts", async ({ request, runtime }) => {
  for (const origin of [runtime.internalOrigin, runtime.origin]) {
    for (const path of ["/sso/thirdparty/oa", "/sso/third-party/wx", "/sso/third-party/wx/"]) {
      const callback = await gatewayRequest(request, origin, path);
      expect(callback.status()).toBe(422);
      expect((await callback.json()).code).toBe("COMMON.VALIDATION_FAILED");
    }
  }
});

test("APISIX uses the entry host to gate desktop WeCom QR creation", async ({ request, runtime }) => {
  const path = "/api/iam/auth/wechat-qr";
  const internal = await gatewayRequest(request, runtime.internalOrigin, path, {
    method: "POST",
    headers: { "X-IAM-Entry-Network": "external" },
  });
  expect(internal.status()).toBe(400);
  const external = await gatewayRequest(request, runtime.origin, path, {
    method: "POST",
    headers: { "X-IAM-Entry-Network": "internal" },
  });
  expect(external.status()).toBe(404);
});

test("APISIX separates SSO protocol URLs from the subject delivery prefix", async ({ request, runtime }) => {
  for (const path of ["/api/iam/sso/.well-known/authentication-configuration", "/sso/user-info", "/sso/authz"]) {
    const response = await gatewayRequest(request, runtime.origin, path);
    expect(response.status()).toBe(404);
  }
});
