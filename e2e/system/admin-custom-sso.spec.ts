import type { Response } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { requireEnvironment } from "./src/environment.ts";

test("Admin configures and enables the seeded Custom SSO client", async ({
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
  await page.goto("/iam-admin/");
  await expect(page).toHaveURL(/\/portal\/login\?/u);

  await page.getByLabel("工号 / 账号").fill(adminUsername);
  await page.getByPlaceholder("请输入登录密码").fill(adminPassword);
  await page.getByRole("button", { name: "安全登录" }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(
    `^${escapeRegExp(origin)}/iam-admin(?:/|$)`,
    "u",
  ));
  await expect(page.getByText("应用管理", { exact: true })).toBeVisible();

  const initialDetailResponse = page.waitForResponse(isClientDetailResponse);
  await page.goto(
    `/iam-admin/clients/${encodeURIComponent(customSsoClientCode)}/edit?section=custom-sso`,
  );
  expect(await readClientDetail(await initialDetailResponse)).toMatchObject({
    clientCode: customSsoClientCode,
    customSsoConfig: null,
    customSsoMode: null,
    customSsoState: "unconfigured",
  });

  await expect(page.getByText(customSsoClientCode, { exact: true })).toBeVisible();
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

  const finalDetailResponse = page.waitForResponse(isClientDetailResponse);
  await page.reload();
  expect(await readClientDetail(await finalDetailResponse)).toMatchObject({
    clientCode: customSsoClientCode,
    customSsoConfig: {
      mode: "gateway",
      orcas: { enabled: false },
      subjectClaimCatalogVersion: 1,
      subjectClaims: ["subjectIdentifier", "profile:username"],
      validRedirectUrls: [customSsoRedirectUri],
    },
    customSsoMode: "gateway",
    customSsoState: "enabled",
  });
  await expect(page.getByText("已启用", { exact: true })).toBeVisible();
  await expect(page.getByText("Gateway", { exact: true }).first()).toBeVisible();
});

function isClientDetailResponse(response: Response) {
  return isSuccessfulRpcResponse(response, "admin.client.detail");
}

function isSuccessfulRpcResponse(response: Response, procedure: string) {
  return response.ok() && response.url().includes(`/rpc/${procedure}`);
}

async function readClientDetail(response: Response) {
  const body = await response.json() as Array<{
    result?: { data?: unknown };
  }>;
  const data = body[0]?.result?.data;
  if (typeof data === "object" && data !== null && "json" in data)
    return (data as { json: unknown }).json;
  return data;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
