import type { APIRequestContext, Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { requireEnvironment } from "./src/environment.ts";
import { createPkceS256Pair } from "./src/oidc-rp.ts";

const externalOrigin = requireEnvironment("IAM_E2E_ORIGIN");
const internalOrigin = process.env.IAM_E2E_INTERNAL_ORIGIN ?? externalOrigin;
const clientId = () => `${requireEnvironment("IAM_E2E_OIDC_CLIENT_CODE")}-dual`;
const customClient = () => requireEnvironment("IAM_E2E_CUSTOM_CLIENT_CODE");
const redirectUri = `${externalOrigin}/e2e/oidc/callback`;
const entries = [{ name: "internal", origin: internalOrigin }, { name: "external", origin: externalOrigin }];

// APIRequestContext does not use Chromium's resolver rules. Only the transport
// destination changes; the actual Host and real APISIX route remain observable.
function gatewayRequest(request: APIRequestContext, origin: string, path: string, options: Parameters<APIRequestContext["fetch"]>[1] = {}) {
  const target = new URL(path, origin);
  const authority = target.host;
  target.hostname = "127.0.0.1";
  return request.fetch(target.href, { ...options, headers: { ...options.headers, Host: authority }, maxRedirects: 0 });
}

async function login(page: Page, origin: string) {
  await expect(page).toHaveURL(url => url.origin === origin && url.pathname === "/portal/login");
  await page.getByLabel("工号 / 账号").fill(requireEnvironment("IAM_E2E_ADMIN_USERNAME"));
  await page.getByPlaceholder("请输入登录密码").fill(requireEnvironment("IAM_E2E_ADMIN_PASSWORD"));
  await page.getByRole("button", { name: "安全登录" }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();
}

for (const entry of entries) {
  test(`${entry.name} APISIX replaces forged entry headers and preserves configured Discovery identity`, async ({ request }) => {
    const response = await gatewayRequest(request, entry.origin, "/oidc/.well-known/openid-configuration?issuer=https://attacker.example", {
      headers: { "X-IAM-Entry-Network": entry.name === "internal" ? "external" : "internal", "X-Forwarded-Host": "attacker.example", "Forwarded": "host=attacker.example;proto=https" },
    });
    expect(response.status()).toBe(200);
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: `${entry.origin}/oidc`,
      authorization_endpoint: `${entry.origin}/oidc/auth`,
      token_endpoint: `${entry.origin}/oidc/token`,
      userinfo_endpoint: `${entry.origin}/oidc/me`,
      jwks_uri: `${entry.origin}/oidc/jwks`,
      end_session_endpoint: `${entry.origin}/oidc/session/end`,
      authorization_response_iss_parameter_supported: true,
    });
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  for (const logoutMode of ["cancel", "confirm"] as const) {
    test(`${entry.name} OIDC browser keeps entry and issuer through ${logoutMode} logout`, async ({ page, request }) => {
      const pkce = createPkceS256Pair();
      const state = `dual-entry-${entry.name}`;
      const authorization = new URL("/oidc/auth", entry.origin);
      authorization.search = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri, response_type: "code", scope: "openid profile", state, nonce: state, code_challenge: pkce.challenge, code_challenge_method: "S256" }).toString();
      const navigation = page.waitForResponse(response => new URL(response.url()).pathname === "/oidc/auth");
      await page.goto(authorization.href);
      const first = await navigation;
      expect(first.headers().location).toMatch(/^\/portal\/login\?/u);
      const interaction = (await page.context().cookies(entry.origin)).find(cookie => cookie.name === "oidc_interaction_binding");
      // Path=/oidc means it is visible only on that path.
      expect(interaction).toBeUndefined();
      const interactionAtProtocol = (await page.context().cookies(`${entry.origin}/oidc/resume`)).find(cookie => cookie.name === "oidc_interaction_binding");
      expect(interactionAtProtocol).toMatchObject({ domain: new URL(entry.origin).hostname, path: "/oidc", httpOnly: true, sameSite: "Lax" });
      await login(page, entry.origin);
      await expect(page).toHaveURL(url => url.origin === externalOrigin && url.pathname === "/e2e/oidc/callback" && url.searchParams.has("code"));
      const callback = new URL(page.url());
      expect(callback.searchParams.get("iss")).toBe(`${entry.origin}/oidc`);
      expect(callback.searchParams.get("state")).toBe(state);
      const root = (await page.context().cookies(entry.origin)).find(cookie => cookie.name === "global_session");
      expect(root).toMatchObject({ domain: new URL(entry.origin).hostname, path: "/", httpOnly: true, sameSite: "Lax" });
      const other = entry.origin === internalOrigin ? externalOrigin : internalOrigin;
      if (other !== entry.origin)
        expect((await page.context().cookies(other)).find(cookie => cookie.name === "global_session")).toBeUndefined();
      const tokenResponse = await gatewayRequest(request, entry.origin, "/oidc/token", {
        method: "POST",
        form: { client_id: clientId(), grant_type: "authorization_code", code: callback.searchParams.get("code")!, redirect_uri: redirectUri, code_verifier: pkce.verifier },
      });
      expect(tokenResponse.status()).toBe(200);
      const tokens = await tokenResponse.json();
      const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"));
      expect(claims).toMatchObject({ iss: `${entry.origin}/oidc`, aud: clientId(), nonce: state });
      const userInfo = () => gatewayRequest(request, entry.origin, "/oidc/me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const beforeLogout = await userInfo();
      expect(beforeLogout.status()).toBe(200);
      expect(await beforeLogout.json()).toMatchObject({ sub: claims.sub, preferred_username: requireEnvironment("IAM_E2E_ADMIN_USERNAME") });
      await page.goto(`${entry.origin}/oidc/session/end`);
      expect(await page.locator("form").getAttribute("action")).toBe("/oidc/session/end/confirm");
      await page.getByRole("button", { name: logoutMode === "cancel" ? "No, stay signed in" : "Yes, sign me out" }).click();
      await expect(page).toHaveURL(`${entry.origin}/oidc/session/end/success`);
      const after = await userInfo();
      expect(after.status()).toBe(logoutMode === "cancel" ? 200 : 401);
      const retainedRoot = (await page.context().cookies(entry.origin)).find(cookie => cookie.name === "global_session");
      if (logoutMode === "cancel")
        expect(retainedRoot?.value).toBe(root?.value);
      else
        expect(retainedRoot).toBeUndefined();
    });
  }
  test(`${entry.name} Custom browser derives the managed callback from its landing origin`, async ({ page, request }) => {
    if (process.env.IAM_E2E_DUAL_ONLY === "1")
      expect(new URL(internalOrigin).hostname).not.toBe(new URL(externalOrigin).hostname);
    const destination = `${entry.origin}/e2e/custom-sso/callback?view=orders&filter=a%2Bb`;
    const state = `managed-${entry.name}`;
    const authorization = new URL("/sso/authorize", entry.origin);
    authorization.search = new URLSearchParams({ client: customClient(), redirectUrl: destination, state }).toString();
    const firstResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/sso/authorize");
    await page.goto(authorization.href);
    expect((await firstResponse).headers().location).toMatch(/^\/portal\/login\?/u);
    const managedCallback = page.waitForRequest(request => new URL(request.url()).pathname === "/sso/callback");
    const landingResponse = page.waitForResponse(response => response.request().isNavigationRequest()
      && new URL(response.url()).origin === entry.origin
      && new URL(response.url()).pathname === "/e2e/custom-sso/callback");
    await login(page, entry.origin);
    const actualCallback = new URL((await managedCallback).url());
    expect(actualCallback.origin).toBe(entry.origin);
    expect(actualCallback.pathname).toBe("/sso/callback");
    expect(actualCallback.searchParams.get("client")).toBe(customClient());
    expect(actualCallback.searchParams.get("code")).toBeTruthy();
    expect(actualCallback.searchParams.get("redirectUrl")).toBe(destination);
    await expect(page).toHaveURL(url => url.origin === entry.origin && url.pathname === "/e2e/custom-sso/callback" && url.searchParams.has("token"));
    expect((await landingResponse).status()).toBe(200);
    const final = new URL(page.url());
    expect(final.searchParams.get("state")).toBe(state);
    const token = final.searchParams.get("token")!;
    expect(token).toBeTruthy();
    final.searchParams.delete("state");
    final.searchParams.delete("token");
    expect(final.href).toBe(destination);
    const roots = (await page.context().cookies()).filter(cookie => cookie.name === "global_session");
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ domain: new URL(entry.origin).hostname, path: "/", httpOnly: true, sameSite: "Lax" });
    const other = entry.origin === internalOrigin ? externalOrigin : internalOrigin;
    if (other !== entry.origin)
      expect((await page.context().cookies(other)).find(cookie => cookie.name === "global_session")).toBeUndefined();
    const localCookieName = `local_${customClient()}_session`;
    expect((await page.context().cookies(entry.origin)).find(cookie => cookie.name === localCookieName))
      .toMatchObject({ value: token, domain: new URL(entry.origin).hostname, path: "/", httpOnly: true, sameSite: "Lax" });
    if (other !== entry.origin)
      expect((await page.context().cookies(other)).find(cookie => cookie.name === localCookieName)).toBeUndefined();
    const userInfo = () => gatewayRequest(request, entry.origin, "/api/iam/public/user-info", { headers: { Authorization: token, Client: customClient() } });
    const before = await userInfo();
    expect(before.status()).toBe(200);
    expect(await before.json()).toMatchObject({ data: { profile: { username: requireEnvironment("IAM_E2E_ADMIN_USERNAME") } } });
    await page.goto(`${entry.origin}/sso/logout?${new URLSearchParams({ redirectUrl: `${entry.origin}/portal/login` })}`);
    await expect(page).toHaveURL(`${entry.origin}/portal/login`);
    const after = await userInfo();
    expect(after.status()).toBe(401);
    expect((await page.context().cookies(entry.origin)).find(cookie => cookie.name === "global_session")).toBeUndefined();
  });

  test(`${entry.name} business callback stays registered and exchanges its Code through APISIX`, async ({ page, request }) => {
    const businessClient = requireEnvironment("IAM_E2E_BUSINESS_CLIENT_CODE");
    const destination = `${entry.origin}/e2e/business/landing?view=orders`;
    const state = `business-${entry.name}`;
    await page.goto(`${entry.origin}/sso/authorize?${new URLSearchParams({ client: businessClient, redirectUrl: destination, state })}`);
    const callbackResponse = page.waitForResponse(response => response.request().isNavigationRequest()
      && new URL(response.url()).origin === externalOrigin
      && new URL(response.url()).pathname === "/e2e/business/callback");
    await login(page, entry.origin);
    await expect(page).toHaveURL(url => url.origin === externalOrigin && url.pathname === "/e2e/business/callback" && url.searchParams.has("code"));
    expect((await callbackResponse).status()).toBe(200);
    const callback = new URL(page.url());
    expect(callback.searchParams.get("registered")).toBe("1");
    expect(callback.searchParams.get("redirectUrl")).toBe(destination);
    expect(callback.searchParams.get("client")).toBe(businessClient);
    expect(callback.searchParams.get("state")).toBe(state);
    expect(callback.searchParams.has("token")).toBe(false);
    const exchanged = await gatewayRequest(request, entry.origin, "/sso/token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${businessClient}:e2e-business-secret-local-only`).toString("base64")}` },
      form: { code: callback.searchParams.get("code")!, redirect_uri: destination },
    });
    expect(exchanged.status()).toBe(200);
    const result = await exchanged.json();
    expect(result.data.sid).toBeTruthy();
    expect(result.data.ttl).toBeGreaterThan(0);
    const userInfo = await gatewayRequest(request, entry.origin, "/api/iam/public/user-info", {
      headers: { Authorization: result.data.sid, Client: businessClient },
    });
    expect(userInfo.status()).toBe(200);
    expect(await userInfo.json()).toMatchObject({ data: { profile: { username: requireEnvironment("IAM_E2E_ADMIN_USERNAME") } } });
    const landingResponse = await page.goto(destination);
    expect(landingResponse?.status()).toBe(200);
    await expect(page).toHaveURL(destination);
  });
}

for (const path of ["/oidc/.well-known/openid-configuration", "/sso/.well-known/authentication-configuration"]) {
  test(`unknown authority cannot select an issuer at ${path}`, async ({ request }) => {
    const unknown = new URL(externalOrigin);
    unknown.hostname = "unknown.iam.localhost";
    const response = await gatewayRequest(request, unknown.origin, path, { headers: { "X-IAM-Entry-Network": "internal" } });
    expect(response.status()).toBe(404);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });
}

test("configured entry metadata uses shared JWKS without merging distinct issuer identities", async ({ request }) => {
  const internal = await gatewayRequest(request, internalOrigin, "/oidc/jwks");
  const external = await gatewayRequest(request, externalOrigin, "/oidc/jwks");
  expect(internal.status()).toBe(200);
  expect(external.status()).toBe(200);
  const internalKeys = await internal.json();
  expect(internalKeys.keys.length).toBeGreaterThan(0);
  expect(internalKeys).toEqual(await external.json());
});
