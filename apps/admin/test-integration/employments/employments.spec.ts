// Browser Integration uses a mocked backend; this is not a full-system journey.

import type { AuditLogSearchParams } from "@admin/services/audit";
import type { updateEmployment } from "@admin/services/employment";
import { ApiErrorCode, EmploymentStatus } from "@iam/contracts";
import { expect, type Page, test } from "@playwright/test";
import {
  adminCapabilitySummary,
  adminEmploymentSearchResult,
  createHrEmploymentAllowedActions,
  currentAdminUser,
  hrAdminEmploymentDetail,
} from "../../test/mocks/fixtures";
import { fulfillJson, fulfillTrpc, parseTrpcBatchInput } from "../fixtures";
import { mockScopedManagementApi } from "../scoped-management.fixture";

const calendarDay = (page: Page, date: string) =>
  page.locator(`.ant-picker-dropdown:visible .ant-picker-cell-in-view[title="${date}"]`);

test("Employment filters and creation selectors use the granted organization scope", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2090-03-01T16:30:00Z"));
  const { employmentSearchInputs } = await mockScopedManagementApi(page);
  const requests: unknown[] = [];
  const pending = {
    ...hrAdminEmploymentDetail,
    status: EmploymentStatus.Pending,
    statusText: "未启用",
    startTime: "2090-03-01",
    endTime: "2090-04-01",
    allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Pending, hrAdminEmploymentDetail.isPrimary),
  };
  await page.route("**/rpc/admin.employment.create**", (route) => {
    requests.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, { changed: true, result: { id: pending.id } });
  });
  await page.route("**/rpc/admin.employment.search**", (route) => {
    employmentSearchInputs.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, requests.length ? { result: [pending], total: 1 } : adminEmploymentSearchResult);
  });
  await page.route("**/rpc/admin.employment.detail**", (route) => fulfillTrpc(route, pending));

  await page.goto("/iam-admin/employments");
  await expect(page.getByRole("cell", { name: /张三/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /新增雇佣/ })).toBeVisible();
  await expect.poll(() => employmentSearchInputs.length).toBeGreaterThan(0);
  expect(employmentSearchInputs[0]).toMatchObject({
    conditions: {
      exactConditions: {
        statuses: [EmploymentStatus.Enable, EmploymentStatus.Pause, EmploymentStatus.Pending],
      },
    },
  });

  await page.getByRole("combobox", { name: "雇佣状态" }).click();
  await page.getByText("结束", { exact: true }).last().click();
  await expect
    .poll(() => employmentSearchInputs.at(-1))
    .toMatchObject({
      conditions: { exactConditions: { statuses: [EmploymentStatus.Disable] } },
    });

  const userSearch = page.getByRole("searchbox", { name: "搜索雇佣用户" });
  await userSearch.fill(" 张三 ");
  await userSearch.press("Enter");
  await page.getByRole("combobox", { name: "主岗筛选" }).click();
  await page.getByTitle("非主岗", { exact: true }).click();
  await expect
    .poll(() => employmentSearchInputs.at(-1))
    .toMatchObject({
      conditions: {
        fuzzyConditions: { userText: "张三" },
        exactConditions: { statuses: [EmploymentStatus.Disable], isPrimary: false },
      },
    });
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect
    .poll(() => employmentSearchInputs.at(-1))
    .toMatchObject({
      conditions: {
        fuzzyConditions: {},
        exactConditions: { statuses: [EmploymentStatus.Enable, EmploymentStatus.Pause, EmploymentStatus.Pending] },
      },
    });

  const row = page.getByRole("row").filter({ hasText: "张三" });
  await expect(row.getByText("查看")).toBeVisible();
  await expect(row.getByText("转岗")).toHaveCount(0);
  await page.getByRole("button", { name: /新增雇佣/ }).click();
  const createDialog = page.getByRole("dialog").filter({ hasText: "新增雇佣" });
  const userSelector = createDialog.getByRole("combobox", { name: "用户" });
  await userSelector.fill("李");
  const pausedUser = page.getByText(/李四.*lisi/);
  await expect(pausedUser).toBeVisible();
  await pausedUser.click();
  await createDialog.getByRole("combobox").nth(1).click();
  const scopedOrganization = page.getByText("授权根 A (ROOT-A)");
  await expect(scopedOrganization).toBeVisible();
  await expect(page.getByText("范围外根")).toHaveCount(0);
  await scopedOrganization.click();
  await createDialog.getByRole("combobox", { name: /岗位/ }).click();
  await page.getByText("财务经理 (FIN-001)").last().click();
  const startDate = createDialog.getByPlaceholder("开始日");
  await expect(startDate).toHaveValue("2090-03-02");
  await startDate.click();
  await calendarDay(page, pending.startTime).click();
  await calendarDay(page, pending.startTime).click();
  await createDialog.getByRole("button", { name: /确\s*定/ }).click();
  await expect(createDialog.getByText("开始日必须早于截止日")).toBeVisible();
  expect(requests).toEqual([]);
  await startDate.click();
  await calendarDay(page, pending.startTime).click();
  await calendarDay(page, pending.endTime).click();
  await createDialog.getByRole("button", { name: /确\s*定/ }).click();
  await expect
    .poll(() => requests)
    .toEqual([
      {
        username: "lisi",
        orgCode: "ROOT-A",
        posCode: "FIN-001",
        isPrimary: false,
        description: null,
        startTime: pending.startTime,
        endTime: pending.endTime,
      },
    ]);
  await expect(row.getByText("未启用")).toBeVisible();
  await page.getByRole("combobox", { name: "雇佣状态" }).click();
  await page.getByText("未启用", { exact: true }).last().click();
  await expect
    .poll(() => employmentSearchInputs.at(-1))
    .toMatchObject({
      conditions: { exactConditions: { statuses: [EmploymentStatus.Pending] } },
    });
  await row.getByText("查看").click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText(pending.startTime)).toBeVisible();
  await expect(detail.getByText(pending.endTime)).toBeVisible();
  await expect(detail.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
  await expect(detail.getByRole("button", { name: "恢复", exact: true })).toHaveCount(0);
});

test("Employment transfers between granted roots using the global Position catalog", async ({ page }) => {
  const { employmentTransfers } = await mockScopedManagementApi(page);

  await page.goto("/iam-admin/employments");
  const row = page.getByRole("row").filter({ hasText: "张三" });
  await row.getByText("查看").click();
  const drawer = page.getByRole("dialog").filter({ hasText: "张三" });

  await drawer.getByRole("button", { name: /转\s*岗/ }).click();
  const transferDialog = page.getByRole("dialog").filter({ hasText: "转岗 — 张三 (zhangsan)" });
  await transferDialog.getByRole("combobox").first().click();
  await expect(page.getByText("授权根 A (ROOT-A)")).toBeVisible();
  await expect(page.getByText("授权根 B (ROOT-B)")).toBeVisible();
  await expect(page.getByText("范围外根")).toHaveCount(0);
  await page.getByText("授权根 B (ROOT-B)").click();
  await transferDialog.getByRole("combobox").nth(1).click();
  await expect(page.getByText("财务经理 (FIN-001)").last()).toBeVisible();
  await page.getByText("财务经理 (FIN-001)").last().click();
  await transferDialog.getByRole("radio", { name: "主任职", exact: true }).check();
  await transferDialog.getByLabel("新任职截止日").fill("2090-04-01");
  await transferDialog.getByRole("button", { name: /确\s*定/ }).click();

  await expect.poll(() => employmentTransfers.length).toBe(1);
  expect(employmentTransfers[0]).toMatchObject({
    id: 42,
    data: {
      newOrgCode: "ROOT-B",
      newPosCode: "FIN-001",
      isPrimary: true,
      endTime: "2090-04-01",
    },
  });
  const endedTransfer = drawer.getByRole("button", { name: /转\s*岗/ });
  await expect(endedTransfer).toBeDisabled();
  await expect(endedTransfer).toHaveAttribute("title", "目标资源当前状态不支持此操作");
  await page.goto("/iam-admin/positions");
  await expect(page.getByRole("cell", { name: "财务经理" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /新建岗位/ })).toHaveCount(0);
  await expect(page.locator("td a")).toHaveCount(0);
});

test("Employment description edits stay in the detail and survive a scoped log-tab visit", async ({ page }) => {
  await mockScopedManagementApi(page);
  await page.route("**/public/user-info", (route) =>
    fulfillJson(route, { code: 200, message: "OK", data: currentAdminUser }),
  );
  await page.route("**/rpc/admin.authorization.capabilitySummary**", (route) =>
    fulfillTrpc(route, adminCapabilitySummary),
  );
  let description: string | null = "原任职备注";
  await page.route("**/rpc/admin.employment.detail**", (route) =>
    fulfillTrpc(route, { ...hrAdminEmploymentDetail, description }),
  );
  type UpdateInput = { id: number; data: Parameters<typeof updateEmployment>[1] };
  const updates: UpdateInput[] = [];
  await page.route("**/rpc/admin.employment.update**", (route) => {
    const input = parseTrpcBatchInput<UpdateInput>(route);
    updates.push(input);
    description = input.data.description ?? null;
    return fulfillTrpc(route, { changed: true, result: null });
  });
  const auditSearches: AuditLogSearchParams[] = [];
  await page.route("**/rpc/admin.audit.search**", (route) => {
    auditSearches.push(parseTrpcBatchInput<AuditLogSearchParams>(route));
    return fulfillTrpc(route, { result: [], total: 0 });
  });
  await page.goto("/iam-admin/employments");
  await page.getByRole("row").filter({ hasText: "张三" }).getByText("查看").click();
  const drawer = page.getByRole("dialog");
  const basic = drawer.getByRole("region", { name: "基本信息" });
  await basic.getByRole("button", { name: /^(编\s*辑)$/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const note = basic.getByRole("textbox", { name: "备注", exact: true });
  await note.fill("待保存备注");
  expect(auditSearches).toEqual([]);
  await drawer.getByRole("tab", { name: "操作日志" }).click();
  await expect
    .poll(() => auditSearches)
    .toEqual([
      {
        pageNum: 1,
        pageSize: 10,
        conditions: { targetType: "employment", targetId: 42 },
      },
    ]);
  await drawer.getByRole("tab", { name: "任职信息" }).click();
  await expect(note).toHaveValue("待保存备注");
  await basic.getByRole("button", { name: /取\s*消/ }).click();
  await basic.getByRole("button", { name: /^(编\s*辑)$/ }).click();
  await expect(note).toHaveValue("原任职备注");
  expect(updates).toEqual([]);
  await note.fill("  更新任职备注  ");
  await basic.getByRole("button", { name: /保\s*存/ }).click();
  await expect(note).toHaveCount(0);
  await expect(basic.getByText("更新任职备注", { exact: true })).toBeVisible();
  expect(updates).toEqual([{ id: 42, data: { description: "  更新任职备注  " } }]);
  await basic.getByRole("button", { name: /^(编\s*辑)$/ }).click();
  await expect(note).toHaveValue("  更新任职备注  ");
});

for (const committedFailure of [false, true]) {
  test(`Employment dates submit and refresh committed facts (propagation failure: ${committedFailure})`, async ({
    page,
  }) => {
    const { employmentSearchInputs } = await mockScopedManagementApi(page);
    const updates: Array<{ id: number; data: Record<string, unknown> }> = [];
    const initialPeriod = { startTime: "2026-01-05", endTime: committedFailure ? "2026-02-01" : null };
    const committedPeriod = { startTime: committedFailure ? null : initialPeriod.startTime, endTime: "2026-02-07" };
    const description = "有效期变更说明";
    const searchResult = () => (updates.length ? { result: [], total: 0 } : adminEmploymentSearchResult);
    await page.route("**/rpc/admin.employment.search**", (route) => {
      employmentSearchInputs.push(parseTrpcBatchInput(route));
      return fulfillTrpc(route, searchResult());
    });
    await page.route("**/rpc/admin.organizationResponsibility.searchAssignments,admin.employment.search**", (route) => {
      const inputs = new URL(route.request().url()).searchParams.get("input");
      employmentSearchInputs.push(JSON.parse(inputs ?? "{}")["1"]);
      return fulfillJson(route, [
        { result: { data: { items: [], total: 0, nextCursor: null } } },
        { result: { data: searchResult() } },
      ]);
    });
    await page.route("**/rpc/admin.employment.detail**", (route) =>
      fulfillTrpc(route, {
        ...hrAdminEmploymentDetail,
        ...(updates.length === 0 ? initialPeriod : committedPeriod),
        ...(updates.length === 0
          ? {}
          : {
              description: committedFailure ? hrAdminEmploymentDetail.description : description,
              status: EmploymentStatus.Disable,
              isPrimary: false,
              allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Disable, false),
            }),
      }),
    );
    await page.route("**/rpc/admin.employment.update**", (route) => {
      updates.push(parseTrpcBatchInput(route));
      return committedFailure
        ? fulfillJson(route, [
            {
              error: {
                message: "required propagation failed",
                code: -32603,
                data: {
                  code: "INTERNAL_SERVER_ERROR",
                  httpStatus: 500,
                  serviceCode: ApiErrorCode.AdminMutationCommitted,
                },
              },
            },
          ])
        : fulfillTrpc(route, { changed: true, result: null });
    });

    await page.goto("/iam-admin/employments");
    await page.getByRole("row").filter({ hasText: "张三" }).getByText("查看").click();
    const drawer = page.getByRole("dialog");
    const basic = drawer.getByRole("region", { name: "基本信息" });
    const edit = basic.getByRole("button", { name: /^(编\s*辑)$/ });
    await edit.click();
    await basic.getByRole("button", { name: /保\s*存/ }).click();
    await expect(edit).toBeVisible();
    expect(updates).toEqual([]);
    await edit.click();

    const start = basic.getByPlaceholder("开始日");
    const end = basic.getByPlaceholder("截止日");
    const save = basic.getByRole("button", { name: /保\s*存/ });
    await expect(start).toHaveValue(initialPeriod.startTime);
    await expect(end).toHaveValue(initialPeriod.endTime ?? "");
    const readsBeforeSave = employmentSearchInputs.length;
    if (!initialPeriod.endTime) {
      await end.click();
      await calendarDay(page, "2026-02-01").click();
      await basic.getByRole("heading", { name: "基本信息" }).click();
      await expect(end).toHaveValue("2026-02-01");
      await basic.getByRole("textbox", { name: "备注", exact: true }).fill(description);
    } else {
      await start.click();
      await page.getByText("清空开始日", { exact: true }).click();
      await expect(start).toHaveValue("");
      await expect(end).toHaveValue("2026-02-01");
    }
    await save.click();
    await expect(edit).toBeDisabled();
    await expect(basic.getByText(committedPeriod.endTime, { exact: true })).toBeVisible();
    await expect(basic.getByText("2026-02-01", { exact: true })).toHaveCount(0);
    await expect(drawer.getByText("结束", { exact: true }).first()).toBeVisible();
    await expect.poll(() => employmentSearchInputs.length).toBeGreaterThan(readsBeforeSave);
    await expect(
      page
        .getByRole("table")
        .filter({ has: page.getByRole("columnheader") })
        .getByRole("row")
        .filter({ hasText: "张三" }),
    ).toHaveCount(0);
    if (committedFailure) await expect(drawer.getByRole("alert")).toContainText("后续处理失败");
    else await expect(basic.getByText(description, { exact: true })).toBeVisible();
    expect(updates).toEqual([
      { id: 42, data: committedFailure ? { startTime: null } : { endTime: "2026-02-01", description } },
    ]);
  });
}
