// Browser Integration uses a mocked backend; this is not a full-system journey.

import type { AuditLogSearchParams } from "@admin/services/audit";
import type { updateEmployment } from "@admin/services/employment";
import { EmploymentStatus } from "@iam/contracts";
import { expect, test } from "@playwright/test";
import { adminCapabilitySummary, currentAdminUser, hrAdminEmploymentDetail } from "../../test/mocks/fixtures";
import { fulfillJson, fulfillTrpc, parseTrpcBatchInput } from "../fixtures";
import { mockScopedManagementApi } from "../scoped-management.fixture";

test("Employment filters and creation selectors use the granted organization scope", async ({ page }) => {
  const { employmentSearchInputs } = await mockScopedManagementApi(page);

  await page.goto("/iam-admin/employments");
  await expect(page.getByRole("cell", { name: /张三/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /新增雇佣/ })).toBeVisible();
  await expect.poll(() => employmentSearchInputs.length).toBeGreaterThan(0);
  expect(employmentSearchInputs[0]).toMatchObject({
    conditions: {
      exactConditions: {
        statuses: [EmploymentStatus.Enable, EmploymentStatus.Pause],
      },
    },
  });

  await page.getByText("展开", { exact: true }).click();
  await page.getByRole("combobox", { name: "状态 :" }).click();
  await page.getByText("结束", { exact: true }).last().click();
  await page.getByRole("button", { name: /查\s*询/ }).click();
  await expect.poll(() => employmentSearchInputs.length).toBeGreaterThan(1);
  expect(employmentSearchInputs.at(-1)).toMatchObject({
    conditions: { exactConditions: { statuses: [EmploymentStatus.Disable] } },
  });

  await page.getByRole("textbox", { name: /用户/ }).fill(" 张三 ");
  await page.getByRole("combobox", { name: /主岗/ }).click();
  await page.getByTitle("否", { exact: true }).click();
  await page.getByRole("button", { name: /查\s*询/ }).click();
  await expect
    .poll(() => employmentSearchInputs.at(-1))
    .toMatchObject({
      conditions: {
        fuzzyConditions: { userText: "张三" },
        exactConditions: { statuses: [EmploymentStatus.Disable], isPrimary: false },
      },
    });
  await page.getByRole("button", { name: /重\s*置/ }).click();
  await expect
    .poll(() => employmentSearchInputs.at(-1))
    .toMatchObject({
      conditions: {
        fuzzyConditions: {},
        exactConditions: { statuses: [EmploymentStatus.Enable, EmploymentStatus.Pause] },
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
  await expect(page.getByText("财务经理 (FIN-001)").last()).toBeVisible();
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
  await transferDialog.getByRole("button", { name: /确\s*定/ }).click();

  await expect.poll(() => employmentTransfers.length).toBe(1);
  expect(employmentTransfers[0]).toMatchObject({
    id: 42,
    data: {
      newOrgCode: "ROOT-B",
      newPosCode: "FIN-001",
      isPrimary: true,
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
  await basic.getByRole("button", { name: "编辑备注" }).click();
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
  await basic.getByRole("button", { name: "编辑备注" }).click();
  await expect(note).toHaveValue("原任职备注");
  expect(updates).toEqual([]);
  await note.fill("  更新任职备注  ");
  await basic.getByRole("button", { name: /保\s*存/ }).click();
  await expect(note).toHaveCount(0);
  await expect(basic.getByText("更新任职备注", { exact: true })).toBeVisible();
  expect(updates).toEqual([{ id: 42, data: { description: "  更新任职备注  " } }]);
  await basic.getByRole("button", { name: "编辑备注" }).click();
  await expect(note).toHaveValue("  更新任职备注  ");
});
