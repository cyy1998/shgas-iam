import { expect, test } from "@playwright/test";
import {
  isSuccessfulRpcResponse,
  loginToAdmin,
  openClientSection,
  runClientProtocolLifecycleAction,
  updateClientStatus,
} from "./src/admin-client-journey.ts";
import { requireEnvironment } from "./src/environment.ts";

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
  const actualRedirectUri = customSsoRedirectUri.replace(/\/\*$/u, "/callback");
  await loginToAdmin({ adminPassword, adminUsername, origin, page });
  await expect(page.getByText("应用管理", { exact: true })).toBeVisible();

  await openClientSection(page, customSsoClientCode, "custom-sso");
  await expect(page.getByText("未配置", { exact: true })).toBeVisible();
  await updateClientStatus(page, customSsoClientCode, "维护中");
  await openClientSection(page, customSsoClientCode, "custom-sso");

  await expect(page.getByText(customSsoClientCode, { exact: true })).toBeVisible();
  await expect(page.getByText("维护中", { exact: true })).toBeVisible();
  await expect(page.getByText("未配置", { exact: true })).toBeVisible();
  await page.getByLabel("允许的 Redirect Patterns").fill(customSsoRedirectUri);
  await page.getByLabel("允许的 Redirect Patterns").press("Enter");
  await page.getByRole("checkbox", { name: /用户名/u }).check();

  const configureResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.client.customSsoConfigure"));
  await page.getByRole("button", { name: "保存 Custom SSO 配置" }).click();
  await configureResponse;
  await expect(page.getByText("已禁用", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /启\s*用/u }).click();
  await expect(page.locator(".ant-modal-confirm-title").filter({
    hasText: "启用 Custom SSO？",
  })).toBeVisible();
  const enableResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.client.customSsoEnable"));
  await page.getByRole("button", { name: /确\s*定/u }).click();
  await enableResponse;
  await expect(page.getByText("已启用", { exact: true })).toBeVisible();

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
  expect(await initialUserInfo.json()).toMatchObject({
    data: {
      profile: { username: adminUsername },
      subjectIdentifier: expect.any(String),
    },
  });

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
  await runClientProtocolLifecycleAction(page, "custom-sso", "禁用");
  await runClientProtocolLifecycleAction(page, "custom-sso", "启用");
  await updateClientStatus(page, customSsoClientCode, "正常");
  const revokedUserInfo = await userInfoRequest();
  expect(revokedUserInfo.status()).toBe(401);

  await openClientSection(page, customSsoClientCode, "custom-sso");
  await expect(page.getByText("已启用", { exact: true })).toBeVisible();
  await expect(page.getByText("Gateway", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(customSsoRedirectUri, { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /用户名/u })).toBeChecked();
});
