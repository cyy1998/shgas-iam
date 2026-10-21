// Browser Integration uses a mocked backend; the system journey is owned by E2E.
import type { DelegationVo } from "@admin/services/delegation";
import { expect, test } from "@playwright/test";
import { currentHrAdminUser, hrAdminCapabilitySummary } from "../../test/mocks/fixtures";
import { mockAdminApi, parseTrpcBatchInput } from "../fixtures";

test("administrator creates, pauses and ends a Client delegation", async ({ page }) => {
  await mockAdminApi(page);
  const allowed = { allowed: true, reason: null } as const;
  const denied = { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" } as const;
  let rows: DelegationVo[] = [];
  const writes: unknown[] = [];
  await page.route("**/rpc/admin.delegation.**", async (route) => {
    const procedurePath = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (!procedurePath) throw new Error("Expected tRPC route");
    const procedures = procedurePath.split(",");
    const input = parseTrpcBatchInput<{ id?: number; data?: { status?: number } }>(route);
    const responses = procedures.map((procedure) => {
      if (procedure.endsWith("selectUsers"))
        return [
          { id: 1, username: "alice", name: "Alice" },
          { id: 2, username: "bob", name: "Bob" },
        ];
      if (procedure.endsWith("selectClients")) return [{ id: 3, clientCode: "expense", clientName: "报销应用" }];
      if (procedure.endsWith("selectOrganizations")) return [{ id: 4, orgCode: "ROOT", orgName: "总部" }];
      if (procedure.endsWith("search")) return rows;
      writes.push(input);
      if (procedure.endsWith("create"))
        rows = [
          {
            id: 7,
            delegatorUserId: 1,
            delegateeUserId: 2,
            clientId: 3,
            organizationScopeId: 4,
            delegatorUsername: "alice",
            delegatorName: "Alice",
            delegateeUsername: "bob",
            delegateeName: "Bob",
            delegatorUser: { id: 1, username: "alice", name: "Alice", isDelete: false },
            delegateeUser: { id: 2, username: "bob", name: "Bob", isDelete: false },
            client: { id: 3, clientCode: "expense", clientName: "报销应用", isDelete: false },
            organizationScope: { id: 4, orgCode: "ROOT", orgName: "总部", isDelete: false },
            startTime: "2026-11-01T01:00:00Z",
            endTime: "2026-11-02T01:00:00Z",
            status: 1,
            description: "浏览器代办",
            createTime: "2026-10-20T00:00:00Z",
            updateTime: "2026-10-20T00:00:00Z",
            allowedActions: { edit: allowed, pause: allowed, resume: denied, end: allowed },
          },
        ];
      else {
        const status = input.data?.status ?? 1;
        rows = rows.map((row) => ({
          ...row,
          status,
          allowedActions: {
            edit: status === 3 ? denied : allowed,
            pause: status === 1 ? allowed : denied,
            resume: status === 2 ? allowed : denied,
            end: status === 3 ? denied : allowed,
          },
        }));
      }
      return { changed: true, result: procedure.endsWith("create") ? rows[0] : null };
    });
    await route.fulfill({ json: responses.map((data) => ({ result: { data } })) });
  });
  await page.goto("/iam-admin/delegations");
  await page.getByRole("button", { name: "新建委托" }).click();
  const dialog = page.getByRole("dialog");
  for (const [label, option] of [
    ["委托人", "Alice（alice）"],
    ["受托人", "Bob（bob）"],
    ["应用", "报销应用（expense）"],
    ["组织范围", "总部（ROOT）"],
  ]) {
    const field = dialog.getByLabel(label, { exact: true });
    await field.click({ timeout: 15_000 });
    const listbox = await field.getAttribute("aria-controls");
    if (!listbox) throw new Error("Select did not expose its controlled listbox");
    await page
      .locator(".ant-select-dropdown")
      .filter({ has: page.locator(`[id="${listbox}"]`) })
      .getByText(option, { exact: true })
      .click();
  }
  await dialog.getByLabel("开始时间").fill("2026-11-01 09:00");
  await dialog.getByLabel("开始时间").press("Enter");
  await dialog.getByLabel("结束时间").fill("2026-11-02 09:00");
  await dialog.getByLabel("结束时间").press("Enter");
  await dialog.getByLabel("说明").fill("浏览器代办");
  await dialog.getByRole("button", { name: /确\s*定/ }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByRole("button", { name: "恢复", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "结束", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /确\s*定/ })
    .click();
  await expect(page.getByRole("button", { name: "编辑", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "恢复", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(3);
});

test("HR cannot enter delegation management or issue a delegation request", async ({ page }) => {
  await mockAdminApi(page, { capabilitySummary: hrAdminCapabilitySummary, currentUser: currentHrAdminUser });
  const requests: string[] = [];
  await page.route("**/rpc/admin.delegation.**", async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await page.goto("/iam-admin/delegations");
  await expect(page.getByText("抱歉，你无权访问该页面")).toBeVisible();
  await expect(page.getByRole("button", { name: "新建委托" })).toHaveCount(0);
  expect(requests).toEqual([]);
});
