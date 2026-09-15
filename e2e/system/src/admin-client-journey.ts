import type { APIResponse, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

type ClientProtocol = "custom-sso" | "oidc";
type ClientProtocolLifecycleAction = "启用" | "禁用";

export async function loginToAdmin(input: {
  adminPassword: string;
  adminUsername: string;
  expectedNavigationText?: string;
  origin: string;
  page: Page;
}) {
  await input.page.goto("/iam-admin/");
  const adminUrl = new RegExp(
    `^${escapeRegExp(input.origin)}/iam-admin(?:/|$)`,
    "u",
  );
  const usernameInput = input.page.getByLabel("工号 / 账号");
  const adminNavigation = input.page.getByRole("menuitem", {
    name: input.expectedNavigationText ?? "应用管理",
  });
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
    `/iam-admin/clients/${encodeURIComponent(clientCode)}/edit?section=${section === "basic" ? "basic" : "sso"}`,
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
  const updateResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.client.updateStatus"));
  await page.getByRole("button", { name: "更新全局状态" }).click();
  await expectRpcMutationResult(await updateResponse, "admin.client.updateStatus", true, null);
  await expect(page.getByText("全局状态已更新", { exact: true })).toBeVisible();
}

export async function runClientProtocolLifecycleAction(
  page: Page,
  action: ClientProtocolLifecycleAction,
) {
  const procedure = "admin.clientSso.setEnabled";
  const response = page.waitForResponse(candidate => isSuccessfulRpcResponse(candidate, procedure));
  await page.getByRole("button", { name: action === "启用" ? "启用 SSO" : "停用 SSO", exact: true }).click();
  await expectRpcMutationResult(await response, procedure, true, expect.any(Object));
  await expect(page.getByRole("button", { name: action === "启用" ? "停用 SSO" : "启用 SSO", exact: true })).toBeVisible();
}
export function isClientDetailResponse(response: Response) {
  return isSuccessfulRpcResponse(response, "admin.client.detail");
}

export function isSuccessfulRpcResponse(response: Response, procedure: string) {
  return response.ok() && rpcProcedures(response.url()).includes(procedure);
}

export async function expectRpcMutationResult(
  response: Response | APIResponse,
  procedure: string,
  changed: boolean,
  result: unknown,
) {
  expect(response.ok()).toBe(true);
  const procedureIndex = rpcProcedures(response.url()).indexOf(procedure);
  expect(procedureIndex).toBeGreaterThanOrEqual(0);
  const body = await response.json();
  const entry = Array.isArray(body) ? body[procedureIndex] : body;
  expect(entry).toEqual({ result: { data: { changed, result } } });
}

export async function saveUnchangedClientProtocolConfiguration(
  page: Page,
  clientCode: string,
  protocol: ClientProtocol,
  expectedEnabled: boolean,
) {
  await openClientSection(page, clientCode, protocol);
  const procedure = "admin.clientSso.selectProtocol";
  const response = page.waitForResponse(candidate => isSuccessfulRpcResponse(candidate, procedure));
  await page.getByRole("button", { name: "保存协议及配置", exact: true }).click();
  await expectRpcMutationResult(await response, procedure, false, expect.any(Object));
  await expect(page.getByText("无需修改", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: expectedEnabled ? "停用 SSO" : "启用 SSO", exact: true })).toBeVisible();
}
function rpcProcedures(url: string) {
  return new URL(url).pathname.split("/rpc/")[1]?.split(",") ?? [];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
