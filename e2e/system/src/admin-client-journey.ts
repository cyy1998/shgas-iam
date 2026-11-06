import { ClientSsoConfigSchema } from "@iam/contracts";
import type { APIResponse, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

type ClientProtocol = "custom-sso" | "oidc";
type ClientProtocolLifecycleAction = "启用" | "禁用";

export async function loginToAdmin(input: {
  adminPassword: string;
  adminUsername: string;
  origin: string;
  page: Page;
}) {
  const adminUrl = new RegExp(`^${escapeRegExp(input.origin)}/iam-admin(?:/|$)`, "u");
  const currentUser = () =>
    input.page.request.get(`${input.origin}/api/iam/public/user-info`, {
      headers: { Client: "iam-admin" },
    });
  const before = await currentUser();
  expect([200, 401]).toContain(before.status());
  await input.page.goto("/iam-admin/");
  if (before.status() === 401) {
    await input.page.getByLabel("工号 / 账号").fill(input.adminUsername);
    await input.page.getByPlaceholder("请输入登录密码").fill(input.adminPassword);
    await input.page.getByRole("button", { name: "安全登录" }).click();
    await input.page.getByRole("button", { name: "跳过", exact: true }).click();
  }
  await expect(input.page).toHaveURL(adminUrl);
  const authenticated = await currentUser();
  expect(authenticated.status()).toBe(200);
  expect(await authenticated.json()).toMatchObject({ code: 200, data: { profile: { username: input.adminUsername } } });
}

export async function openClientSection(page: Page, clientCode: string, section: "basic" | "custom-sso" | "oidc") {
  await page.goto(
    `/iam-admin/clients/${encodeURIComponent(clientCode)}/edit?section=${section === "basic" ? "basic" : "sso"}`,
  );
  const response = await page.request.get(`/api/iam/admin/clients/${encodeURIComponent(clientCode)}`, {
    headers: { Client: "iam-admin" },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ code: 200, data: { clientCode } });
}

export async function updateClientStatus(page: Page, clientCode: string, statusLabel: "正常" | "维护中") {
  await openClientSection(page, clientCode, "basic");
  await page.getByLabel("全局状态").click();
  await page.locator(".ant-select-dropdown:visible").getByText(statusLabel, { exact: true }).click();
  const updateResponse = page.waitForResponse((response) =>
    isSuccessfulRpcResponse(response, "admin.client.updateStatus"),
  );
  await page.getByRole("button", { name: "更新全局状态" }).click();
  await expectRpcMutationResult(await updateResponse, "admin.client.updateStatus", true, null);
}

export async function runClientProtocolLifecycleAction(page: Page, action: ClientProtocolLifecycleAction) {
  const procedure = "admin.clientSso.setEnabled";
  const response = page.waitForResponse((candidate) => isSuccessfulRpcResponse(candidate, procedure));
  await page.getByRole("button", { name: action === "启用" ? "启用 SSO" : "停用 SSO", exact: true }).click();
  await expectRpcMutationResult(
    await response,
    procedure,
    true,
    expect.objectContaining({ ssoEnabled: action === "启用" }),
  );
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
  const response = page.waitForResponse((candidate) => isSuccessfulRpcResponse(candidate, procedure));
  await page.getByRole("button", { name: "保存协议及配置", exact: true }).click();
  await expectRpcMutationResult(
    await response,
    procedure,
    false,
    expect.objectContaining({ clientCode, ssoEnabled: expectedEnabled }),
  );
  expect((await readClientSsoDetail(page, clientCode)).ssoEnabled).toBe(expectedEnabled);
}

export async function readClientSsoDetail(page: Page, clientCode: string) {
  const response = await page.request.get(`/api/iam/admin/clients-sso/${encodeURIComponent(clientCode)}`, {
    headers: { Client: "iam-admin" },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ code: 200, data: { clientCode } });
  const ssoEnabled: unknown = body.data.ssoEnabled;
  if (typeof ssoEnabled !== "boolean") throw new Error("Client SSO detail is missing its enabled state");
  return { clientCode, ssoEnabled, ssoConfig: ClientSsoConfigSchema.nullable().parse(body.data.ssoConfig) };
}
function rpcProcedures(url: string) {
  return new URL(url).pathname.split("/rpc/")[1]?.split(",") ?? [];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
