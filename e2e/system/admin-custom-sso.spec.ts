import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import {
  expectRpcMutationResult,
  isSuccessfulRpcResponse,
  loginToAdmin,
  openClientSection,
  runClientProtocolLifecycleAction,
  saveUnchangedClientProtocolConfiguration,
  updateClientStatus,
} from "./src/admin-client-journey.ts";
import { requireEnvironment } from "./src/environment.ts";
import {
  createHeadResponsibility,
  customSsoProfileHasResponsibility,
  expectInternalResponsibilityDsl,
  waitForInternalResponsibility,
} from "./src/responsibility-journey.ts";
import {
  expectInternalUserProfileSearchMatrix,
  expectLegacyUserSearchEquivalence,
} from "./src/user-profile-search-journey.ts";

test("Admin prepares Custom SSO in Maintenance and existing access resumes after recovery", async ({
  context,
  page,
}) => {
  const origin = requireEnvironment("IAM_E2E_ORIGIN");
  const adminUsername = requireEnvironment("IAM_E2E_ADMIN_USERNAME");
  const adminPassword = requireEnvironment("IAM_E2E_ADMIN_PASSWORD");
  const customSsoClientCode = requireEnvironment(
    "IAM_E2E_CUSTOM_SSO_CLIENT_CODE",
  );
  const customSsoRedirectUri = requireEnvironment(
    "IAM_E2E_CUSTOM_SSO_REDIRECT_URI",
  );
  const internalApiKey = requireEnvironment("IAM_E2E_INTERNAL_API_KEY");
  const adminPrivilegeCode = requireEnvironment("IAM_E2E_ADMIN_PRIVILEGE_CODE");
  const adminRoleCode = requireEnvironment("IAM_E2E_ADMIN_ROLE_CODE");
  const hrAdminRoleCode = requireEnvironment("IAM_E2E_HR_ADMIN_ROLE_CODE");
  const delegateeUsername = requireEnvironment("IAM_E2E_DELEGATEE_USERNAME");
  const disabledUsername = requireEnvironment("IAM_E2E_DISABLED_USERNAME");
  const hrAdminUsername = requireEnvironment("IAM_E2E_HR_ADMIN_USERNAME");
  const noScopeHrAdminUsername = requireEnvironment(
    "IAM_E2E_NO_SCOPE_HR_ADMIN_USERNAME",
  );
  const organizationCode = requireEnvironment("IAM_E2E_ORGANIZATION_CODE");
  const pausedUsername = requireEnvironment("IAM_E2E_PAUSED_USERNAME");
  const positionCode = requireEnvironment("IAM_E2E_POSITION_CODE");
  const responsibilityTargetOrganizationCode = requireEnvironment(
    "IAM_E2E_RESPONSIBILITY_TARGET_ORGANIZATION_CODE",
  );
  const responsibilityHolderPositionCode = requireEnvironment(
    "IAM_E2E_RESPONSIBILITY_HOLDER_POSITION_CODE",
  );
  const actualRedirectUri = customSsoRedirectUri.replace(/\/\*$/u, "/callback");
  await loginToAdmin({ adminPassword, adminUsername, origin, page });
  await expect(page.getByText("应用管理", { exact: true })).toBeVisible();

  await createHeadResponsibility({
    adminUsername,
    origin,
    page,
    positionCode: responsibilityHolderPositionCode,
    targetOrganizationCode: responsibilityTargetOrganizationCode,
  });
  await waitForInternalResponsibility({
    adminUsername,
    expected: true,
    internalApiKey,
    origin,
    positionCode: responsibilityHolderPositionCode,
    request: context.request,
    targetOrganizationCode: responsibilityTargetOrganizationCode,
  });
  await expectInternalResponsibilityDsl({
    adminUsername,
    internalApiKey,
    origin,
    positionCode: responsibilityHolderPositionCode,
    request: context.request,
    targetOrganizationCode: responsibilityTargetOrganizationCode,
  });
  await expectInternalUserProfileSearchMatrix({
    adminPrivilegeCode,
    adminRoleCode,
    adminUsername,
    delegateeUsername,
    disabledUsername,
    hrAdminUsername,
    hrAdminRoleCode,
    internalApiKey,
    noScopeHrAdminUsername,
    organizationCode,
    origin,
    pausedUsername,
    positionCode,
    request: context.request,
    responsibilityHolderPositionCode,
  });

  await updateClientStatus(page, customSsoClientCode, "维护中");
  await openClientSection(page, customSsoClientCode, "custom-sso");
  await expect(page.getByRole("button", { name: "启用 SSO", exact: true })).toBeDisabled();
  await page.getByLabel("SSO 协议", { exact: true }).click();
  await page.getByTitle("Custom SSO", { exact: true }).click();
  await page.getByLabel("回调地址", { exact: true }).fill(`${origin}/sso/callback`);
  await page.getByLabel("Redirect URIs", { exact: true }).fill(customSsoRedirectUri);
  await page.getByLabel("Redirect URIs", { exact: true }).press("Enter");
  for (const claim of ["profile:username", "profile:employments", "iam:authorization"]) {
    await page.getByLabel("主体披露字段", { exact: true }).fill(claim);
    await page.locator(".ant-select-dropdown:visible").getByTitle(claim, { exact: true }).click();
  }
  await page.getByLabel("主体披露字段", { exact: true }).press("Escape");
  const configureResponse = page.waitForResponse(response => isSuccessfulRpcResponse(response, "admin.clientSso.selectProtocol"));
  await page.getByRole("button", { name: "保存协议及配置", exact: true }).click();
  await expectRpcMutationResult(await configureResponse, "admin.clientSso.selectProtocol", true, expect.any(Object));
  await saveUnchangedClientProtocolConfiguration(page, customSsoClientCode, "custom-sso", false);
  await runClientProtocolLifecycleAction(page, "启用");
  const authorize = new URL("/sso/authorize", origin);
  authorize.search = new URLSearchParams({
    client: customSsoClientCode,
    redirectUrl: actualRedirectUri,
    state: "maintenance-e2e",
  }).toString();
  const maintenanceAuthorize = await context.request.get(authorize.href, {
    maxRedirects: 0,
  });
  expect(maintenanceAuthorize.status()).toBe(503);
  expect(await maintenanceAuthorize.json()).toMatchObject({
    code: "AUTH.MAINTENANCE",
  });
  expect(maintenanceAuthorize.headers()["set-cookie"] ?? "").not.toContain("Max-Age=0");

  const configuration = await context.request.get(
    `${origin}/sso/.well-known/authentication-configuration`,
    { headers: { "X-IAM-Entry-Network": "external" } },
  );
  expect(configuration.status()).toBe(200);

  await updateClientStatus(page, customSsoClientCode, "正常");
  await page.goto(authorize.href);
  const callback = new URL(page.url());
  expect(callback.pathname).toBe("/e2e/custom-sso/callback");
  const localSession = callback.searchParams.get("token");
  expect(localSession).toEqual(expect.any(String));

  const userInfoRequest = () => context.request.get(
    `${origin}/api/iam/public/user-info`,
    {
      headers: {
        Authorization: String(localSession),
        Client: encodeURIComponent(customSsoClientCode),
      },
    },
  );
  const initialUserInfo = await userInfoRequest();
  expect(initialUserInfo.status()).toBe(200);
  const initialUserInfoBody = await initialUserInfo.json();
  expect(initialUserInfoBody).toMatchObject({
    data: {
      version: 2,
      profile: {
        username: adminUsername,
      },
      subjectIdentifier: expect.any(String),
    },
  });
  expect(customSsoProfileHasResponsibility(
    initialUserInfoBody,
    {
      positionCode: responsibilityHolderPositionCode,
      targetOrganizationCode: responsibilityTargetOrganizationCode,
    },
  )).toBe(true);
  await expectLegacyUserSearchEquivalence({
    adminPrivilegeCode,
    adminUsername,
    clientCode: customSsoClientCode,
    delegateeUsername,
    disabledUsername,
    internalApiKey,
    localSession: String(localSession),
    organizationCode,
    origin,
    pausedUsername,
    request: context.request,
  });
  expect(JSON.stringify(initialUserInfoBody.data.authorization)).not.toContain(
    "responsibilit",
  );

  const authzResponse = await context.request.get(
    `${origin}/api/iam/auth/authz`,
    {
      headers: {
        "Authorization": String(localSession),
        "Client": encodeURIComponent(customSsoClientCode),
        "X-Forwarded-Uri": "/e2e/responsibility-acceptance",
      },
    },
  );
  expect(authzResponse.status()).toBe(200);
  const authzBody = await authzResponse.json() as { data: string };
  expect(authzResponse.headers()["x-user-info"]).toBe(authzBody.data);
  const gatewaySubject = Buffer.from(authzBody.data, "base64").toString("utf8");
  expect(gatewaySubject).not.toMatch(/responsibilit|employment|authorization/iu);

  await updateClientStatus(page, customSsoClientCode, "维护中");
  const maintenanceUserInfo = await userInfoRequest();
  expect(maintenanceUserInfo.status()).toBe(503);
  expect(await maintenanceUserInfo.json()).toMatchObject({
    code: "AUTH.MAINTENANCE",
  });
  expect(maintenanceUserInfo.headers()["set-cookie"] ?? "").not.toContain("Max-Age=0");

  await updateClientStatus(page, customSsoClientCode, "正常");
  const recoveredUserInfo = await userInfoRequest();
  expect(recoveredUserInfo.status()).toBe(200);
  expect(await recoveredUserInfo.json()).toMatchObject({
    data: {
      profile: { username: adminUsername },
      subjectIdentifier: expect.any(String),
    },
  });

  await updateClientStatus(page, customSsoClientCode, "维护中");
  await openClientSection(page, customSsoClientCode, "custom-sso");
  await runClientProtocolLifecycleAction(page, "禁用");
  await runClientProtocolLifecycleAction(page, "启用");
  await updateClientStatus(page, customSsoClientCode, "正常");
  const enabledAgainUserInfo = await userInfoRequest();
  expect(enabledAgainUserInfo.status()).toBe(200);

  const adminHeaders = { Client: encodeURIComponent(requireEnvironment("IAM_E2E_ADMIN_CLIENT_CODE")) };
  const inventoryResponse = await context.request.post(`${origin}/api/iam/admin/session-management/sessions/search`, {
    headers: adminHeaders,
    data: { conditions: { kind: "clientSession" }, pageNum: 1, pageSize: 100 },
  });
  expect(inventoryResponse.status()).toBe(200);
  const inventory = await inventoryResponse.json();
  expect(inventory.data.total).toBeLessThanOrEqual(100);
  const targets = inventory.data.result.flatMap((item: {
    record?: { kind: string; clientId?: string; identity: unknown };
  }) => item.record?.kind === "clientSession" && item.record.clientId === customSsoClientCode
    ? [item.record.identity]
    : []);
  expect(targets.length).toBeGreaterThan(0);
  const revokeResponse = await context.request.post(`${origin}/api/iam/admin/session-management/sessions/revoke`, {
    headers: adminHeaders,
    data: { target: { type: "captured", targets } },
  });
  expect(revokeResponse.status()).toBe(200);
  expect(await revokeResponse.json()).toMatchObject({ data: { changed: true, result: { sessions: {
    userSessionsTerminated: 0,
    clientSessionsTerminated: targets.length,
    failed: 0,
    unknown: 0,
  } } } });
  const revokedUserInfo = await userInfoRequest();
  expect(revokedUserInfo.status()).toBe(401);

  await page.goto(authorize.href);
  const renewedCallback = new URL(page.url());
  expect(renewedCallback.pathname).toBe("/e2e/custom-sso/callback");
  const renewedLocalSession = renewedCallback.searchParams.get("token");
  expect(renewedLocalSession).toEqual(expect.any(String));
  expect(renewedLocalSession).not.toBe(localSession);
  const renewedUserInfo = await context.request.get(
    `${origin}/api/iam/public/user-info`,
    {
      headers: {
        Authorization: String(renewedLocalSession),
        Client: encodeURIComponent(customSsoClientCode),
      },
    },
  );
  expect(renewedUserInfo.status()).toBe(200);
  expect(customSsoProfileHasResponsibility(
    await renewedUserInfo.json(),
    {
      positionCode: responsibilityHolderPositionCode,
      targetOrganizationCode: responsibilityTargetOrganizationCode,
    },
  )).toBe(true);

  await openClientSection(page, customSsoClientCode, "custom-sso");
  await expect(page.getByRole("button", { name: "停用 SSO", exact: true })).toBeVisible();
  await expect(page.getByLabel("回调地址", { exact: true })).toHaveValue(`${origin}/sso/callback`);
  await expect(page.getByText(customSsoRedirectUri, { exact: true })).toBeVisible();
  await expect(page.locator(".ant-select-selection-item").filter({ hasText: "profile:username" })).toBeVisible();
  await expect(page.locator(".ant-select-selection-item").filter({ hasText: "profile:employments" })).toBeVisible();
});
