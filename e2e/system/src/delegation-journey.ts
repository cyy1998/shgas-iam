import { ApiErrorCode, PrivilegeDelegationStatus } from "@iam/contracts";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { expectRpcMutationResult, isSuccessfulRpcResponse, loginToAdmin } from "./admin-client-journey.ts";

interface DelegationJourneyInput {
  adminPassword: string;
  adminUsername: string;
  adminClientCode: string;
  delegateeUsername: string;
  hrAdminUsername: string;
  internalApiKey: string;
  internalClientCode: string;
  organizationCode: string;
  origin: string;
  page: Page;
  request: APIRequestContext;
}

export async function expectClientDelegationJourney(input: DelegationJourneyInput) {
  const { page } = input;
  const now = Date.now();
  const description = `Cross-entry delegation ${input.internalClientCode}`;
  await test.step("Admin creates the Client delegation and Internal resolves its direct delegatee", async () => {
    await page.goto("/iam-admin/delegations");
    await page.getByRole("button", { name: "新建委托", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "新建委托" });
    const selections: Array<[string, string]> = [
      ["委托人", input.adminUsername],
      ["受托人", input.delegateeUsername],
      ["应用", input.internalClientCode],
      ["组织范围", input.organizationCode],
    ];
    for (const [label, value] of selections) {
      await selectIdentity(page, dialog, label, value);
    }
    await dialog.getByLabel("开始时间", { exact: true }).fill(localDateTime(now - 3_600_000));
    await dialog.getByLabel("开始时间", { exact: true }).press("Enter");
    await dialog.getByLabel("结束时间", { exact: true }).fill(localDateTime(now + 7_200_000));
    await dialog.getByLabel("结束时间", { exact: true }).press("Enter");
    await dialog.getByLabel("说明", { exact: true }).fill(description);
    const createdResponse = page.waitForResponse((response) =>
      isSuccessfulRpcResponse(response, "admin.delegation.create"),
    );
    await dialog.getByRole("button", { name: /确\s*定/u }).click();
    await expectRpcMutationResult(await createdResponse, "admin.delegation.create", true, expect.any(Object));
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: description })).toBeVisible();
    await expectResolution(input, input.delegateeUsername);
  });

  const records = await internalSearch(input);
  const record = records.find((item) => item.description === description);
  if (typeof record?.id !== "number")
    throw new Error("Admin-created delegation was not visible to its Internal Client");
  const id = record.id;
  expect(record).toMatchObject({
    delegatorUsername: input.adminUsername,
    delegateeUsername: input.delegateeUsername,
    client: { clientCode: input.internalClientCode },
  });
  await expectClientBoundary(input, id, now);

  const browser = page.context().browser();
  if (!browser) throw new Error("Client delegation journey requires a real browser");
  const receiverContext = await browser.newContext();
  const ownerPage = await page.context().newPage();
  try {
    const receiverPage = await receiverContext.newPage();
    await test.step("SSO outgoing and incoming show the same relationship while the receiver cannot manage it", async () => {
      await ownerPage.goto(`${input.origin}/portal/userInfo`);
      await ownerPage.getByRole("tab", { name: "委托设置", exact: true }).click();
      const outgoing = ownerPage.getByRole("region", { name: "委托设置", exact: true });
      await outgoing.getByRole("tab", { name: "我委托的", exact: true }).click();
      await showAllDelegations(ownerPage);
      await expect(outgoing.getByRole("row").filter({ hasText: description })).toBeVisible();
      await loginToPortal(receiverPage, input, input.delegateeUsername);
      const incoming = receiverPage.getByRole("region", { name: "委托设置", exact: true });
      await incoming.getByRole("tab", { name: "委托给我的", exact: true }).click();
      await showAllDelegations(receiverPage);
      const incomingRow = incoming.getByRole("row").filter({ hasText: description });
      await expect(incomingRow).toBeVisible();
      await expect(incomingRow.getByRole("button", { name: /^(编辑|暂停|恢复|结束)$/u })).toHaveCount(0);
      const forbiddenUpdate = await receiverContext.request.patch(`${input.origin}/api/iam/public/delegations/${id}`, {
        headers: { Client: "iam" },
        data: { status: PrivilegeDelegationStatus.Disable },
      });
      expect(forbiddenUpdate.status()).toBe(404);
      await expectResolution(input, input.delegateeUsername);
    });

    await test.step("SSO pause and Internal resume are reflected in the owner and administrator views", async () => {
      const row = ownerPage.getByRole("row").filter({ hasText: description });
      const pausedResponse = ownerPage.waitForResponse(
        (response) => response.url().endsWith(`/public/delegations/${id}`) && response.request().method() === "PATCH",
      );
      await row.getByRole("button", { name: "暂停", exact: true }).click();
      expect((await pausedResponse).status()).toBe(200);
      await expect(row.getByRole("button", { name: "恢复", exact: true })).toBeVisible();
      await expectResolution(input, null);
      const deletion = await input.request.delete(
        `${input.origin}/api/iam/admin/users/${encodeURIComponent(input.delegateeUsername)}`,
        { headers: { Client: encodeURIComponent(input.adminClientCode) } },
      );
      expect(deletion.status()).toBe(409);
      expect(await deletion.json()).toMatchObject({ code: ApiErrorCode.UserHasOpenPrivilegeDelegation });
      await internalUpdate(input, id, { status: PrivilegeDelegationStatus.Enable });
      await expectResolution(input, input.delegateeUsername);
      await ownerPage.reload();
      await showAllDelegations(ownerPage);
      await expect(
        ownerPage.getByRole("row").filter({ hasText: description }).getByRole("button", { name: "暂停", exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("row").filter({ hasText: description }).getByRole("button", { name: "暂停", exact: true }),
      ).toBeVisible();
    });

    await test.step("Natural expiry can be extended from SSO while manual ending remains final and readable", async () => {
      await editPeriod(ownerPage, id, description, now - 7_200_000, now - 3_600_000);
      await expectResolution(input, null);
      await expect(ownerPage.getByRole("row").filter({ hasText: description })).toContainText("已到期");
      await editPeriod(ownerPage, id, description, now - 7_200_000, now + 10_800_000);
      await expectResolution(input, input.delegateeUsername);
      const row = ownerPage.getByRole("row").filter({ hasText: description });
      await row.getByRole("button", { name: "结束", exact: true }).click();
      const endedResponse = ownerPage.waitForResponse(
        (response) => response.url().endsWith(`/public/delegations/${id}`) && response.request().method() === "PATCH",
      );
      await ownerPage.getByRole("button", { name: "确认结束", exact: true }).click();
      expect((await endedResponse).status()).toBe(200);
      await expectResolution(input, null);
      await expect(row).toContainText("已结束");
      await expect(row.getByRole("button", { name: /^(编辑|暂停|恢复|结束)$/u })).toHaveCount(0);
      const reopen = await input.request.patch(`${input.origin}/api/iam/internal/delegations/${id}`, {
        headers: { apikey: input.internalApiKey },
        data: { status: PrivilegeDelegationStatus.Enable },
      });
      expect(reopen.status()).toBe(409);
      expect(await reopen.json()).toMatchObject({ code: ApiErrorCode.PrivilegeDelegationEnded });
      const history = await internalSearch(input);
      expect(history.find((item) => item.id === id)).toMatchObject({
        status: PrivilegeDelegationStatus.Disable,
        description,
      });
      await page.reload();
      await expect(page.getByRole("row").filter({ hasText: description })).toContainText("已结束");
      await receiverPage.reload();
      await receiverPage.getByRole("tab", { name: "委托设置", exact: true }).click();
      await receiverPage.getByRole("tab", { name: "委托给我的", exact: true }).click();
      await showAllDelegations(receiverPage);
      await expect(receiverPage.getByRole("row").filter({ hasText: description })).toContainText("已结束");
    });
  } finally {
    await ownerPage.close();
    await receiverContext.close();
  }
  await expectHrBoundary(input);
}

async function expectClientBoundary(input: DelegationJourneyInput, id: number, now: number) {
  await test.step("Different Clients may overlap but Internal cannot observe or mutate the other Client", async () => {
    const choicesResponse = await input.request.post(`${input.origin}/api/iam/admin/delegations/selectors/clients`, {
      headers: { Client: encodeURIComponent(input.adminClientCode) },
      data: { search: input.adminClientCode, purpose: "create" },
    });
    expect(choicesResponse.status()).toBe(200);
    const choices = recordsFrom(await choicesResponse.json());
    const client = choices.find((choice) => choice.clientCode === input.adminClientCode);
    if (typeof client?.id !== "number")
      throw new Error("Admin Client selector did not return the requested synthetic Client");
    const alternate = await input.request.post(`${input.origin}/api/iam/admin/delegations`, {
      headers: { Client: encodeURIComponent(input.adminClientCode) },
      data: {
        delegatorUsername: input.adminUsername,
        delegateeUsername: input.delegateeUsername,
        clientId: client.id,
        orgCode: input.organizationCode,
        startTime: new Date(now - 3_600_000).toISOString(),
        endTime: new Date(now + 7_200_000).toISOString(),
        description: "Separate Client scope",
      },
    });
    expect(alternate.status()).toBe(200);
    const alternateId = recordFrom(recordFrom(await alternate.json()).data).result;
    const alternateRecord = recordFrom(alternateId);
    if (typeof alternateRecord.id !== "number")
      throw new Error("Admin create did not return the new delegation identity");
    expect((await internalSearch(input)).map((item) => item.id)).toEqual([id]);
    const rejected = await input.request.patch(`${input.origin}/api/iam/internal/delegations/${alternateRecord.id}`, {
      headers: { apikey: input.internalApiKey },
      data: { status: PrivilegeDelegationStatus.Disable },
    });
    expect(rejected.status()).toBe(404);
    const ended = await input.request.patch(`${input.origin}/api/iam/admin/delegations/${alternateRecord.id}`, {
      headers: { Client: encodeURIComponent(input.adminClientCode) },
      data: { status: PrivilegeDelegationStatus.Disable },
    });
    expect(ended.status()).toBe(200);
    await expectResolution(input, input.delegateeUsername);
  });
}

async function expectHrBoundary(input: DelegationJourneyInput) {
  const browser = input.page.context().browser();
  if (!browser) throw new Error("HR boundary journey requires a real browser");
  const context = await browser.newContext({ baseURL: input.origin });
  try {
    const page = await context.newPage();
    await loginToAdmin({ ...input, adminUsername: input.hrAdminUsername, expectedNavigationText: "组织责任", page });
    await expect(page.getByRole("menuitem", { name: "委托管理", exact: true })).toHaveCount(0);
    const denied = await context.request.post(`${input.origin}/api/iam/admin/delegations/search`, {
      headers: { Client: encodeURIComponent(input.adminClientCode) },
      data: {},
    });
    expect(denied.status()).toBe(403);
  } finally {
    await context.close();
  }
}

async function loginToPortal(page: Page, input: DelegationJourneyInput, username: string) {
  await page.goto(`${input.origin}/portal/userInfo`);
  await page.getByLabel("工号 / 账号").fill(username);
  await page.getByPlaceholder("请输入登录密码").fill(input.adminPassword);
  await page.getByRole("button", { name: "安全登录" }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();
  await page.getByRole("tab", { name: "委托设置", exact: true }).click();
  await expect(page.getByRole("region", { name: "委托设置", exact: true })).toBeVisible();
}

async function showAllDelegations(page: Page) {
  await page.getByRole("tab", { name: "委托设置", exact: true }).click();
  await page.getByRole("combobox", { name: "委托状态筛选", exact: true }).click();
  await page.locator(".ant-select-dropdown:visible").getByTitle("全部", { exact: true }).click();
}

async function selectIdentity(page: Page, dialog: Locator, label: string, code: string) {
  const field = dialog.getByLabel(label, { exact: true });
  await field.click();
  await field.fill(code);
  const listbox = await field.getAttribute("aria-controls");
  if (!listbox) throw new Error(`Selector ${label} did not expose its controlled listbox`);
  const popup = page.locator(".ant-select-dropdown").filter({ has: page.locator(`[id="${listbox}"]`) });
  await popup.getByTitle(new RegExp(`（${escapeRegExp(code)}）$`, "u")).click();
}

async function editPeriod(page: Page, id: number, description: string, start: number, end: number) {
  await page
    .getByRole("row")
    .filter({ hasText: description })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("开始时间", { exact: true }).fill(localDateTime(start));
  await dialog.getByLabel("开始时间", { exact: true }).press("Enter");
  await dialog.getByLabel("结束时间", { exact: true }).fill(localDateTime(end));
  await dialog.getByLabel("结束时间", { exact: true }).press("Enter");
  const saved = page.waitForResponse(
    (response) => response.url().endsWith(`/public/delegations/${id}`) && response.request().method() === "PATCH",
  );
  await dialog.getByRole("button", { name: "保存委托", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(dialog).toBeHidden();
}

async function expectResolution(input: DelegationJourneyInput, delegateeUsername: string | null) {
  const response = await input.request.post(`${input.origin}/api/iam/internal/delegations/resolve`, {
    headers: { apikey: input.internalApiKey },
    data: { usernames: [input.adminUsername], orgCode: input.organizationCode },
  });
  expect(response.status()).toBe(200);
  expect(recordsFrom(await response.json())).toEqual([{ username: input.adminUsername, delegateeUsername }]);
}

async function internalSearch(input: DelegationJourneyInput) {
  const response = await input.request.post(`${input.origin}/api/iam/internal/delegations/search`, {
    headers: { apikey: input.internalApiKey },
    data: { delegatorUsernames: [input.adminUsername] },
  });
  expect(response.status()).toBe(200);
  return recordsFrom(await response.json());
}

async function internalUpdate(input: DelegationJourneyInput, id: number, data: { status: PrivilegeDelegationStatus }) {
  const response = await input.request.patch(`${input.origin}/api/iam/internal/delegations/${id}`, {
    headers: { apikey: input.internalApiKey },
    data,
  });
  expect(response.status()).toBe(200);
  expect(recordFrom(await response.json()).data).toBe(true);
}

function recordsFrom(value: unknown) {
  const data = recordFrom(value).data;
  if (!Array.isArray(data)) throw new Error("Expected an array in the successful response envelope");
  return data.map(recordFrom);
}

function recordFrom(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected a response object");
  return value as Record<string, unknown>;
}

function localDateTime(milliseconds: number) {
  const date = new Date(milliseconds);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
