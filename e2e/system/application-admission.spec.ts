import { randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  expectRpcMutationResult,
  isSuccessfulRpcResponse,
  loginToAdmin,
  openClientSection,
} from "./src/admin-client-journey.ts";
import { test } from "./src/gateway-test.ts";
import { createPkceS256Pair, receiveOidcAuthorizationCallback } from "./src/oidc-rp.ts";

test("Admin admission changes govern new Custom SSO and OIDC grants while existing sessions remain usable", async ({
  runtime,
  browser,
  page: adminPage,
  request,
}) => {
  const origin = runtime.origin;
  const adminUsername = runtime.references.adminUsername;
  const adminPassword = runtime.adminPassword;
  const delegatee = runtime.references.delegateeUsername;
  const runId = runtime.references.runId;
  const customClient = `${runtime.references.customSsoClientCode}-dual`;
  const oidc = {
    clientId: runtime.references.oidcClientCode,
    redirectUri: runtime.references.oidcRedirectUri,
    origin,
  };
  const targets = [customClient, oidc.clientId];
  const filter = { field: "username", op: "eq", value: adminUsername };
  const matching = await browser.newContext({ baseURL: origin });
  const nonmatching = await browser.newContext({ baseURL: origin });
  try {
    const matchingPage = await matching.newPage();
    const deniedPage = await nonmatching.newPage();
    await loginToAdmin({ adminPassword, adminUsername, origin, page: adminPage });
    await test.step("save a username condition in both applications while the policies are disabled", async () => {
      for (const clientCode of targets) {
        await openClientSection(adminPage, clientCode, "admission");
        await expectPersistedAdmission(adminPage, clientCode, false, null);
        await adminPage.getByLabel("字段", { exact: true }).click();
        await adminPage.getByTitle("账号", { exact: true }).click();
        await adminPage.getByLabel("条件值", { exact: true }).fill(adminUsername);
        await admissionMutation(adminPage, "save", "保存条件", {
          enabled: false,
          filter,
        });
        await expectPersistedAdmission(adminPage, clientCode, false, filter);
      }
    });

    await loginToPortal(deniedPage, delegatee, adminPassword);
    const oldCustomToken = await customGrant(deniedPage, origin, customClient);
    const oldOidcGrant = await oidcGrant(deniedPage, oidc);
    const oldAccessToken = await exchangeOidcGrant(request, oidc, oldOidcGrant);
    const rootSession = await rootSessionValue(deniedPage, origin);
    expect(rootSession).toBeTruthy();

    await test.step("enable admission and reject a nonmatching user through each protocol", async () => {
      for (const clientCode of targets) {
        await setAdmission(adminPage, clientCode, true);
        await expectPersistedAdmission(adminPage, clientCode, true, filter);
      }

      const requestedLoginPaths: string[] = [];
      const deniedNavigations: string[] = [];
      deniedPage.on("request", (navigation) => {
        if (!navigation.isNavigationRequest()) return;
        const path = new URL(navigation.url()).pathname;
        if (path === "/portal/login") requestedLoginPaths.push(path);
        if (path === "/portal/application-access-denied") deniedNavigations.push(navigation.url());
      });
      const customRequest = newCustomRequest(origin, customClient);
      const customClientStatus = waitForPublicClientStatus(deniedPage, origin, customClient);
      const customDenied = await deniedPage.goto(customRequest.authorization.href);
      expect(customDenied?.status()).toBe(200);
      await expect(deniedPage).toHaveURL(admissionDeniedUrl(origin, customClient));
      await expectPublicClientStatus(customClientStatus, customClient, `E2E Managed Origins ${runId}`);
      expect(new URL(deniedPage.url()).searchParams.has("token")).toBe(false);

      const interactive = newOidcRequest(oidc);
      const callback = await oidcDenial(deniedPage, oidc, interactive);
      const errorUri = callback.searchParams.get("error_uri");
      expect(errorUri).toBe(admissionDeniedUrl(origin, oidc.clientId));
      if (!errorUri) throw new Error("The interactive RP callback must receive the IAM rejection page");
      const oidcClientStatus = waitForPublicClientStatus(deniedPage, origin, oidc.clientId);
      await deniedPage.goto(errorUri);
      await expect(deniedPage).toHaveURL(admissionDeniedUrl(origin, oidc.clientId));
      await expectPublicClientStatus(oidcClientStatus, oidc.clientId, `E2E OIDC RP ${runId}`);

      const silent = newOidcRequest(oidc);
      silent.authorization.searchParams.set("prompt", "none");
      const silentCallback = await oidcDenial(deniedPage, oidc, silent);
      expect(silentCallback.searchParams.has("error_uri")).toBe(false);
      await expect(deniedPage).toHaveURL(silentCallback.href);
      expect(requestedLoginPaths).toEqual([]);
      expect(deniedNavigations).toEqual([
        admissionDeniedUrl(origin, customClient),
        admissionDeniedUrl(origin, oidc.clientId),
      ]);
      expect(await rootSessionValue(deniedPage, origin)).toBe(rootSession);
    });

    await test.step("matching users still receive grants and existing application credentials remain valid", async () => {
      await loginToPortal(matchingPage, adminUsername, adminPassword);
      await customGrant(matchingPage, origin, customClient);
      await oidcGrant(matchingPage, oidc);

      const customInfo = await request.get(`${origin}/api/iam/sso/user-info`, {
        headers: { Authorization: oldCustomToken, Client: customClient },
      });
      expect(customInfo.status()).toBe(200);
      expect(await customInfo.json()).toMatchObject({ data: { profile: { username: delegatee } } });
      const oidcInfo = await request.get(`${origin}/oidc/me`, {
        headers: { Authorization: `Bearer ${oldAccessToken}` },
      });
      expect(oidcInfo.status()).toBe(200);
      expect(await oidcInfo.json()).toMatchObject({ preferred_username: delegatee });
    });

    await test.step("disabling both policies preserves the condition and restores new grants", async () => {
      for (const clientCode of targets) {
        await setAdmission(adminPage, clientCode, false);
        await expectPersistedAdmission(adminPage, clientCode, false, filter);
      }
      await customGrant(deniedPage, origin, customClient);
      await oidcGrant(deniedPage, oidc);
    });
  } finally {
    await Promise.all([matching.close(), nonmatching.close()]);
  }
});

async function loginToPortal(page: Page, username: string, password: string) {
  await page.goto("/portal/userInfo");
  await page.getByLabel("工号 / 账号").fill(username);
  await page.getByPlaceholder("请输入登录密码").fill(password);
  await page.getByRole("button", { name: "安全登录" }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/portal/userInfo");
}

async function admissionMutation(page: Page, action: "save" | "setEnabled", button: string, result: unknown) {
  const procedure = `admin.clientAdmission.${action}`;
  const response = page.waitForResponse((candidate) => isSuccessfulRpcResponse(candidate, procedure));
  await page.getByRole("button", { name: button, exact: true }).click();
  await expectRpcMutationResult(await response, procedure, true, result);
}

async function setAdmission(page: Page, clientCode: string, enabled: boolean) {
  await openClientSection(page, clientCode, "admission");
  await admissionMutation(page, "setEnabled", enabled ? "开启准入策略" : "关闭准入策略", { enabled });
}

async function expectPersistedAdmission(page: Page, clientCode: string, enabled: boolean, filter: unknown) {
  const response = await page.request.get(`/api/iam/admin/clients/${encodeURIComponent(clientCode)}/admission`, {
    headers: { Client: "iam-admin" },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ code: 200, data: { enabled, filter } });
}

function newCustomRequest(origin: string, clientCode: string) {
  const redirectUrl = `${origin}/e2e/custom-sso/callback`;
  const state = randomUUID();
  const authorization = new URL("/sso/authorize", origin);
  authorization.search = new URLSearchParams({ client: clientCode, redirectUrl, state }).toString();
  return { authorization, redirectUrl, state };
}

async function customGrant(page: Page, origin: string, clientCode: string) {
  const { authorization, redirectUrl, state } = newCustomRequest(origin, clientCode);
  const response = await page.goto(authorization.href);
  expect(response?.status()).toBe(200);
  const callback = new URL(page.url());
  expect(`${callback.origin}${callback.pathname}`).toBe(redirectUrl);
  expect(callback.searchParams.get("state")).toBe(state);
  const token = callback.searchParams.get("token");
  if (!token) throw new Error("Custom SSO callback did not receive a session token");
  return token;
}

interface OidcRp {
  origin: string;
  clientId: string;
  redirectUri: string;
}

function newOidcRequest(rp: OidcRp) {
  const pkce = createPkceS256Pair();
  const state = randomUUID();
  const authorization = new URL("/oidc/auth", rp.origin);
  authorization.search = new URLSearchParams({
    client_id: rp.clientId,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    redirect_uri: rp.redirectUri,
    response_type: "code",
    scope: "openid profile",
    state,
  }).toString();
  return { authorization, verifier: pkce.verifier, state };
}

async function oidcGrant(page: Page, rp: OidcRp) {
  const { authorization, state, verifier } = newOidcRequest(rp);
  const response = await page.goto(authorization.href);
  expect(response?.status()).toBe(200);
  return { ...receiveOidcAuthorizationCallback(page.url(), { redirectUri: rp.redirectUri, state }), verifier };
}

async function oidcDenial(page: Page, rp: OidcRp, { authorization, state }: ReturnType<typeof newOidcRequest>) {
  const response = await page.goto(authorization.href);
  expect(response?.status()).toBe(200);
  const callback = new URL(page.url());
  expect(`${callback.origin}${callback.pathname}`).toBe(rp.redirectUri);
  expect(callback.searchParams.get("state")).toBe(state);
  expect(callback.searchParams.get("error")).toBe("access_denied");
  expect(callback.searchParams.has("code")).toBe(false);
  return callback;
}

async function exchangeOidcGrant(request: APIRequestContext, rp: OidcRp, grant: { code: string; verifier: string }) {
  const response = await request.post(`${rp.origin}/oidc/token`, {
    form: {
      client_id: rp.clientId,
      code: grant.code,
      code_verifier: grant.verifier,
      grant_type: "authorization_code",
      redirect_uri: rp.redirectUri,
    },
  });
  expect(response.status()).toBe(200);
  const { access_token: token } = await response.json();
  if (typeof token !== "string" || !token) throw new Error("OIDC token response is missing its access token");
  return token;
}

function admissionDeniedUrl(origin: string, clientCode: string) {
  return `${origin}/portal/application-access-denied?${new URLSearchParams({ client: clientCode })}`;
}

function waitForPublicClientStatus(page: Page, origin: string, clientCode: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === origin &&
      url.pathname === "/api/iam/auth/client/status" &&
      url.searchParams.get("clientCode") === clientCode &&
      response.request().method() === "GET"
    );
  });
}

async function expectPublicClientStatus(
  pending: ReturnType<typeof waitForPublicClientStatus>,
  clientCode: string,
  clientName: string,
) {
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ code: 200, data: { clientCode, clientName } });
}

async function rootSessionValue(page: Page, origin: string) {
  return (await page.context().cookies(origin)).find((cookie) => cookie.name === "global_session")?.value;
}
