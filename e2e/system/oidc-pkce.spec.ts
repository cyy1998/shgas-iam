import type { APIRequestContext, Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  loginToAdmin,
  openClientSection,
  runClientProtocolLifecycleAction,
  saveUnchangedClientProtocolConfiguration,
  updateClientStatus,
} from "./src/admin-client-journey.ts";
import { requireEnvironment } from "./src/environment.ts";
import { createPkceS256Pair, receiveOidcAuthorizationCallback } from "./src/oidc-rp.ts";
import {
  createHeadResponsibility,
  oidcUserInfoHasResponsibility,
  readInternalResponsibility,
  waitForInternalResponsibility,
} from "./src/responsibility-journey.ts";
import { exerciseUnifiedSession } from "./src/unified-session-journey.ts";
import { waitForEmploymentSearchVisibility } from "./src/user-profile-search-journey.ts";

test("public RP observes reversible Maintenance and permanent logout through real Admin control", async ({
  browser,
  page,
  request,
}) => {
  const origin = requireEnvironment("IAM_E2E_ORIGIN");
  const adminUsername = requireEnvironment("IAM_E2E_ADMIN_USERNAME");
  const adminPassword = requireEnvironment("IAM_E2E_ADMIN_PASSWORD");
  const clientId = requireEnvironment("IAM_E2E_OIDC_CLIENT_CODE");
  const redirectUri = requireEnvironment("IAM_E2E_OIDC_REDIRECT_URI");
  const internalApiKey = requireEnvironment("IAM_E2E_INTERNAL_API_KEY");
  const responsibilityTargetOrganizationCode = requireEnvironment(
    "IAM_E2E_RESPONSIBILITY_TARGET_ORGANIZATION_CODE",
  );
  const responsibilityHolderPositionCode = requireEnvironment("IAM_E2E_RESPONSIBILITY_HOLDER_POSITION_CODE");
  const adminContext = await browser.newContext({ baseURL: origin });
  const adminPage = await adminContext.newPage();
  await loginToAdmin({
    adminPassword,
    adminUsername,
    origin,
    page: adminPage,
  });
  await updateClientStatus(adminPage, clientId, "维护中");
  await openClientSection(adminPage, clientId, "oidc");
  await runClientProtocolLifecycleAction(adminPage, "禁用");
  await runClientProtocolLifecycleAction(adminPage, "启用");
  await expect(adminPage.locator(".ant-tag").filter({ hasText: /^维护中$/u })).toBeVisible();
  await expect(adminPage.getByRole("button", { name: "停用 SSO", exact: true })).toBeVisible();
  await ensureHeadResponsibility({
    adminPage,
    adminUsername,
    internalApiKey,
    origin,
    request,
    positionCode: responsibilityHolderPositionCode,
    targetOrganizationCode: responsibilityTargetOrganizationCode,
  });

  const pkce = createPkceS256Pair();
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const authorization = new URL("/oidc/auth", origin);
  authorization.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    nonce,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile iam:employments",
    state,
  }).toString();

  await expectMaintenanceAuthorizationError({
    authorization,
    redirectUri,
    request,
    state,
  });

  const [maintenanceDiscovery, maintenanceJwks, maintenanceHealth] = await Promise.all([
    request.get(`${origin}/oidc/.well-known/openid-configuration`),
    request.get(`${origin}/oidc/jwks`),
    request.get(`${origin}/oidc/health`),
  ]);
  expect(maintenanceDiscovery.status()).toBe(200);
  expect(maintenanceJwks.status()).toBe(200);
  expect(maintenanceHealth.status()).toBe(200);

  await updateClientStatus(adminPage, clientId, "正常");

  await page.goto(authorization.href);
  await expect(page).toHaveURL(/\/portal\/login\?/u);

  const interactionCookie = (await page.context().cookies(`${origin}/oidc/resume`)).find(
    cookie => cookie.name === "oidc_interaction_binding",
  );
  expect(interactionCookie).toMatchObject({
    httpOnly: true,
    path: "/oidc",
    sameSite: "Lax",
    secure: false,
  });

  await page.getByLabel("工号 / 账号").fill(adminUsername);
  await page.getByPlaceholder("请输入登录密码").fill(adminPassword);
  await page.getByRole("button", { name: "安全登录" }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();

  await expect(page).toHaveURL((url) => {
    const expected = new URL(redirectUri);
    return url.origin === expected.origin && url.pathname === expected.pathname;
  });
  const { code } = receiveOidcAuthorizationCallback(page.url(), {
    redirectUri,
    state,
  });

  await saveUnchangedClientProtocolConfiguration(adminPage, clientId, "oidc", true);

  await pauseEmploymentWithResponsibilityCascade(adminPage, adminUsername, responsibilityHolderPositionCode);
  await waitForInternalResponsibility({
    adminUsername,
    expected: false,
    internalApiKey,
    origin,
    positionCode: responsibilityHolderPositionCode,
    request,
    targetOrganizationCode: responsibilityTargetOrganizationCode,
  });
  await waitForEmploymentSearchVisibility({
    adminUsername,
    expected: false,
    internalApiKey,
    origin,
    positionCode: responsibilityHolderPositionCode,
    request,
  });
  await resumeEmployment(adminPage, adminUsername, responsibilityHolderPositionCode);
  await waitForEmploymentSearchVisibility({
    adminUsername,
    expected: true,
    internalApiKey,
    origin,
    positionCode: responsibilityHolderPositionCode,
    request,
  });
  await endEmployment(adminPage, adminUsername, responsibilityHolderPositionCode);
  await waitForEmploymentSearchVisibility({
    adminUsername,
    expected: false,
    internalApiKey,
    origin,
    positionCode: responsibilityHolderPositionCode,
    request,
  });

  const tokenForm = {
    client_id: clientId,
    code,
    code_verifier: pkce.verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  };
  const pkceMismatchResponse = await request.post(`${origin}/oidc/token`, {
    form: {
      ...tokenForm,
      code_verifier: "mismatched-pkce-verifier-that-is-long-enough-for-oauth",
    },
  });
  expect(pkceMismatchResponse.status()).toBe(400);
  expect(await pkceMismatchResponse.json()).toMatchObject({
    error: "invalid_grant",
  });

  const burnedCodeResponse = await request.post(`${origin}/oidc/token`, {
    form: tokenForm,
  });
  expect(burnedCodeResponse.status()).toBe(400);
  expect(await burnedCodeResponse.json()).toMatchObject({ error: "invalid_grant" });

  await page.goto(authorization.href);
  await expect(page).toHaveURL((url) => {
    const expected = new URL(redirectUri);
    return url.origin === expected.origin && url.pathname === expected.pathname;
  });
  tokenForm.code = receiveOidcAuthorizationCallback(page.url(), { redirectUri, state }).code;
  const tokenResponse = await request.post(`${origin}/oidc/token`, {
    form: tokenForm,
  });
  expect(tokenResponse.status()).toBe(200);
  let tokens = (await tokenResponse.json()) as Record<string, unknown>;
  expect(tokens).toMatchObject({
    token_type: "Bearer",
    scope: "openid profile iam:employments",
  });
  expect(tokens.access_token).toEqual(expect.any(String));
  expect(tokens.id_token).toEqual(expect.any(String));
  expect(tokens.expires_in).toEqual(expect.any(Number));

  const userInfoResponse = await request.get(`${origin}/oidc/me`, {
    headers: { authorization: `Bearer ${String(tokens.access_token)}` },
  });
  expect(userInfoResponse.status()).toBe(200);
  const userInfo = (await userInfoResponse.json()) as Record<string, unknown>;
  expect(userInfo).toMatchObject({ preferred_username: adminUsername });
  expect(
    oidcUserInfoHasResponsibility(userInfo, {
      positionCode: responsibilityHolderPositionCode,
      targetOrganizationCode: responsibilityTargetOrganizationCode,
    }),
  ).toBe(false);
  expect(userInfo.sub).toEqual(expect.any(String));
  const idToken = readJwtClaims(String(tokens.id_token));
  expect(idToken).toMatchObject({
    aud: clientId,
    iss: `${origin}/oidc`,
    nonce,
    sub: userInfo.sub,
  });
  expect(idToken).not.toHaveProperty("iam:employments");
  expect(idToken).not.toHaveProperty("iam:authorization");
  expect(JSON.stringify(idToken)).not.toContain("responsibilit");

  tokens = await exerciseUnifiedSession({
    adminPage,
    page,
    origin,
    clientId,
    redirectUri,
    originalCode: tokenForm.code,
    originalAccessToken: String(tokens.access_token),
  });

  await updateClientStatus(adminPage, clientId, "维护中");
  const maintenanceUserInfo = await request.get(`${origin}/oidc/me`, {
    headers: { authorization: `Bearer ${String(tokens.access_token)}` },
  });
  expect(maintenanceUserInfo.status()).toBe(503);
  expect(await maintenanceUserInfo.json()).toEqual({
    error: "temporarily_unavailable",
    error_description: "Client is under maintenance",
  });
  expect(maintenanceUserInfo.headers()["set-cookie"]).toBeUndefined();

  await updateClientStatus(adminPage, clientId, "正常");
  const recoveredUserInfo = await request.get(`${origin}/oidc/me`, {
    headers: { authorization: `Bearer ${String(tokens.access_token)}` },
  });
  expect(recoveredUserInfo.status()).toBe(200);
  expect(await recoveredUserInfo.json()).toMatchObject({ sub: userInfo.sub });

  await updateClientStatus(adminPage, clientId, "维护中");
  const logout = new URL("/oidc/session/end", origin);
  logout.search = new URLSearchParams({
    id_token_hint: String(tokens.id_token),
    post_logout_redirect_uri: `${origin}/e2e/oidc/logged-out`,
    state: "maintenance-logout",
  }).toString();
  const logoutPrompt = await page.context().request.get(logout.href, {
    maxRedirects: 0,
  });
  expect(logoutPrompt.status()).toBe(200);
  const logoutForm = await logoutPrompt.text();
  const logoutAction = logoutForm.match(/<form[^>]+action="([^"]+)"/u)?.[1];
  const logoutXsrf = logoutForm.match(/name="xsrf" value="([^"]+)"/u)?.[1];
  expect(logoutAction).toEqual(expect.any(String));
  expect(logoutXsrf).toEqual(expect.any(String));
  const logoutResponse = await page.context().request.post(new URL(String(logoutAction), origin).href, {
    form: { logout: "yes", xsrf: String(logoutXsrf) },
    maxRedirects: 0,
  });
  expect([302, 303]).toContain(logoutResponse.status());

  await updateClientStatus(adminPage, clientId, "正常");
  const loggedOutUserInfo = await request.get(`${origin}/oidc/me`, {
    headers: { authorization: `Bearer ${String(tokens.access_token)}` },
  });
  expect(loggedOutUserInfo.status()).toBe(401);
  expect(await loggedOutUserInfo.json()).toMatchObject({ error: "invalid_token" });

  const replayResponse = await request.post(`${origin}/oidc/token`, {
    form: tokenForm,
  });
  expect(replayResponse.status()).toBe(400);
  expect(await replayResponse.json()).toMatchObject({
    error: "invalid_grant",
  });
  await adminContext.close();
});

async function expectMaintenanceAuthorizationError(input: {
  authorization: URL;
  redirectUri: string;
  request: APIRequestContext;
  state: string;
}) {
  const callback = new URL(input.redirectUri);
  let current = input.authorization;
  for (let redirectCount = 0; redirectCount < 8; redirectCount += 1) {
    const response = await input.request.get(current.href, { maxRedirects: 0 });
    expect(response.headers()["set-cookie"]).toBeUndefined();
    if (response.status() === 503) {
      expect(await response.json()).toEqual({
        error: "temporarily_unavailable",
        error_description: "Client is under maintenance",
      });
      return;
    }
    expect([302, 303]).toContain(response.status());
    const location = response.headers().location;
    expect(location).toEqual(expect.any(String));
    const target = new URL(String(location), current);
    if (target.origin === callback.origin && target.pathname === callback.pathname) {
      expect(target.searchParams.get("error")).toBe("temporarily_unavailable");
      expect(target.searchParams.get("state")).toBe(input.state);
      return;
    }
    current = target;
  }
  throw new Error("OIDC Maintenance authorization did not reach a temporary error boundary");
}

function readJwtClaims(token: string) {
  const payload = token.split(".")[1];
  if (payload === undefined)
    throw new Error("OIDC ID Token did not contain a payload");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  if (typeof claims.sub !== "string")
    throw new Error("OIDC ID Token did not contain a subject");
  return claims;
}

async function ensureHeadResponsibility(input: {
  adminPage: Page;
  adminUsername: string;
  internalApiKey: string;
  origin: string;
  positionCode: string;
  request: APIRequestContext;
  targetOrganizationCode: string;
}) {
  if (await readInternalResponsibility(input))
    return;
  await createHeadResponsibility({
    adminUsername: input.adminUsername,
    origin: input.origin,
    page: input.adminPage,
    positionCode: input.positionCode,
    targetOrganizationCode: input.targetOrganizationCode,
  });
  await waitForInternalResponsibility({ ...input, expected: true });
}

async function pauseEmploymentWithResponsibilityCascade(
  adminPage: Page,
  adminUsername: string,
  responsibilityHolderPositionCode: string,
) {
  await adminPage.goto("/iam-admin/employments");
  const row = findEmploymentRow(adminPage, adminUsername, responsibilityHolderPositionCode);
  const drawer = await openEmploymentDrawer(adminPage, row, adminUsername, responsibilityHolderPositionCode);
  await drawer.getByRole("button", { name: /暂\s*停/u }).click();
  const confirmation = adminPage.getByRole("dialog", {
    name: "确认暂停该任职？",
  });
  await expect(confirmation).toContainText("该任职下所有启用中的责任任命也会一并暂停");
  await confirmation.getByRole("button", { name: "暂停任职" }).click();
  await expect(adminPage.getByText("已暂停任职及其启用中的责任任命")).toBeVisible();
}

async function resumeEmployment(adminPage: Page, adminUsername: string, positionCode: string) {
  await adminPage.goto("/iam-admin/employments");
  const row = findEmploymentRow(adminPage, adminUsername, positionCode);
  const drawer = await openEmploymentDrawer(adminPage, row, adminUsername, positionCode);
  await drawer.getByRole("button", { name: /恢\s*复/u }).click();
  await expect(
    adminPage.getByText("已恢复任职；责任任命不会自动恢复，请在组织责任中逐条确认后恢复"),
  ).toBeVisible();
}

async function endEmployment(adminPage: Page, adminUsername: string, positionCode: string) {
  await adminPage.goto("/iam-admin/employments");
  const row = findEmploymentRow(adminPage, adminUsername, positionCode);
  const drawer = await openEmploymentDrawer(adminPage, row, adminUsername, positionCode);
  await drawer.getByRole("button", { name: /结\s*束/u }).click();
  const confirmation = adminPage.getByRole("dialog", {
    name: "确认结束该任职？",
  });
  await expect(confirmation).toContainText("结束后不可恢复");
  await confirmation.getByRole("button", { name: "结束任职" }).click();
  await expect(adminPage.getByText("已结束", { exact: true })).toBeVisible();
}

function findEmploymentRow(adminPage: Page, username: string, positionCode: string) {
  return adminPage.getByRole("row").filter({ hasText: username }).filter({ hasText: positionCode });
}

async function openEmploymentDrawer(
  adminPage: Page,
  row: ReturnType<Page["getByRole"]>,
  username: string,
  positionCode: string,
) {
  await row.getByText("查看", { exact: true }).click();
  const drawer = adminPage
    .getByRole("dialog")
    .filter({ hasText: username })
    .filter({ hasText: positionCode });
  await expect(drawer).toBeVisible();
  return drawer;
}
