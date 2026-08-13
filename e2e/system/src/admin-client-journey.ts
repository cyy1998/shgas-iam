import type { Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

const clientProtocolLifecycleProcedures = {
  "custom-sso": {
    启用: "admin.client.customSsoEnable",
    禁用: "admin.client.customSsoDisable",
  },
  "oidc": {
    启用: "admin.client.oidcEnable",
    禁用: "admin.client.oidcDisable",
  },
} as const;

type ClientProtocol = keyof typeof clientProtocolLifecycleProcedures;
type ClientProtocolLifecycleAction = keyof typeof clientProtocolLifecycleProcedures[ClientProtocol];

export async function loginToAdmin(input: {
  adminPassword: string;
  adminUsername: string;
  origin: string;
  page: Page;
}) {
  await input.page.goto("/iam-admin/");
  const adminUrl = new RegExp(
    `^${escapeRegExp(input.origin)}/iam-admin(?:/|$)`,
    "u",
  );
  const usernameInput = input.page.getByLabel("工号 / 账号");
  const adminNavigation = input.page.getByText("应用管理", { exact: true });
  await Promise.race([
    adminNavigation.waitFor({ state: "visible" }),
    usernameInput.waitFor({ state: "visible" }),
  ]);
  if (await usernameInput.isVisible()) {
    await usernameInput.fill(input.adminUsername);
    await input.page.getByPlaceholder("请输入登录密码").fill(input.adminPassword);
    await input.page.getByRole("button", { name: "安全登录" }).click();
    await input.page.getByRole("button", { name: "跳过", exact: true }).click();
  }
  await expect(input.page).toHaveURL(adminUrl);
}

export async function openClientSection(
  page: Page,
  clientCode: string,
  section: "basic" | "custom-sso" | "oidc",
) {
  const detailResponse = page.waitForResponse(isClientDetailResponse);
  await page.goto(
    `/iam-admin/clients/${encodeURIComponent(clientCode)}/edit?section=${section}`,
  );
  await detailResponse;
  await expect(page.getByText(clientCode, { exact: true })).toBeVisible();
}

export async function updateClientStatus(
  page: Page,
  clientCode: string,
  statusLabel: "正常" | "维护中",
) {
  await openClientSection(page, clientCode, "basic");
  await page.getByLabel("全局状态").click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(statusLabel, { exact: true })
    .click();
  await page.getByRole("button", { name: "更新全局状态" }).click();
  await expect(page.locator(".ant-modal-confirm-title").filter({
    hasText: "更新应用全局状态？",
  })).toBeVisible();
  const updateResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.client.updateStatus"));
  await page.getByRole("button", { name: /确\s*定/u }).click();
  await updateResponse;
  await expect(page.getByText("全局状态已更新", { exact: true })).toBeVisible();
}

export async function runClientProtocolLifecycleAction(
  page: Page,
  protocol: ClientProtocol,
  action: ClientProtocolLifecycleAction,
) {
  const procedure = clientProtocolLifecycleProcedures[protocol][action];
  const actionName = action === "启用" ? /启\s*用/u : /禁\s*用/u;
  await page.getByRole("button", { name: actionName }).click();
  const response = page.waitForResponse(candidate =>
    isSuccessfulRpcResponse(candidate, procedure));
  await page.getByRole("button", { name: /确\s*定/u }).click();
  await response;
  await expect(page.getByText(action === "启用" ? "已启用" : "已禁用", {
    exact: true,
  })).toBeVisible();
}

export function isClientDetailResponse(response: Response) {
  return isSuccessfulRpcResponse(response, "admin.client.detail");
}

export function isSuccessfulRpcResponse(response: Response, procedure: string) {
  return response.ok() && response.url().includes(`/rpc/${procedure}`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
