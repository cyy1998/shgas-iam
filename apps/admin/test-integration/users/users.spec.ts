// Browser Integration uses a mocked backend; this is not a full-system journey.

import type { AuditLogSearchParams } from "@admin/services/audit";
import type { UserSearchParams } from "@admin/services/user";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import { expect, test } from "@playwright/test";
import {
  adminUserDetail,
  adminUserSearchResult,
  createHrEmploymentAllowedActions,
  hrAdminUserDetail,
} from "../../test/mocks/fixtures";
import { fulfillTrpc, mockAdminApi, parseTrpcBatchInput } from "../fixtures";
import { collectMutationRequests, mockScopedManagementApi } from "../scoped-management.fixture";

test("User list density changes the header and body row heights", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/iam-admin/users");
  const density = page.getByRole("img", { name: "column-height" });
  const header = page.getByRole("columnheader", { name: "用户", exact: true });
  const row = page.getByRole("row").filter({ hasText: "张三" }).first();
  const rowHeights = async () => ({
    header: await header.evaluate((element) => element.getBoundingClientRect().height),
    body: await row.evaluate((element) => element.getBoundingClientRect().height),
  });
  const selectDensity = async (name: string) => {
    await density.click({ timeout: 5000 });
    await page.getByRole("menuitem", { name, exact: true }).click({ timeout: 5000 });
    return rowHeights();
  };

  await expect(row).toBeVisible();
  const compact = await rowHeights();
  const spacious = await selectDensity("宽松");
  expect(spacious.header).toBeGreaterThan(compact.header);
  expect(spacious.body).toBeGreaterThan(compact.body);

  const medium = await selectDensity("中等");
  expect(medium.header).toBeGreaterThan(compact.header);
  expect(medium.body).toBeGreaterThan(compact.body);
  expect(medium.header).toBeLessThan(spacious.header);
  expect(medium.body).toBeLessThan(spacious.body);
  expect(await selectDensity("紧凑")).toEqual(compact);
});

test("User filters query the server and clearing them restores the unfiltered first page", async ({ page }) => {
  await mockAdminApi(page);
  const searches: UserSearchParams[] = [];
  await page.route("**/rpc/admin.user.search**", (route) => {
    searches.push(parseTrpcBatchInput<UserSearchParams>(route));
    return fulfillTrpc(route, { ...adminUserSearchResult, total: 45 });
  });
  await page.goto("/iam-admin/users");
  await page.locator(".ant-pagination-next").click();
  await expect.poll(() => searches.at(-1)?.pageNum).toBe(2);
  await page.getByRole("searchbox", { name: "搜索用户" }).fill("  张三  ");
  await page.getByRole("searchbox", { name: "搜索用户" }).press("Enter");
  await expect
    .poll(() => searches.at(-1))
    .toMatchObject({
      pageNum: 1,
      conditions: { fuzzyConditions: { text: "张三" } },
    });
  await page.getByRole("combobox", { name: "用户状态" }).click();
  await page.locator(".ant-select-item-option-content").getByText("暂停", { exact: true }).click();
  await expect.poll(() => searches.at(-1)?.conditions?.exactConditions?.statuses).toEqual([UserStatus.Pause]);
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect
    .poll(() => searches.at(-1))
    .toMatchObject({
      pageNum: 1,
      conditions: { fuzzyConditions: {}, exactConditions: {} },
    });
  await expect(page.getByRole("searchbox", { name: "搜索用户" })).toHaveValue("");
});

test("User list query failure stays visible and can be retried", async ({ page }) => {
  await mockAdminApi(page);
  let unavailable = true;
  await page.route("**/rpc/admin.user.search**", (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify([
            {
              error: {
                message: "用户查询暂时不可用",
                code: -32603,
                data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 },
              },
            },
          ]),
        })
      : fulfillTrpc(route, adminUserSearchResult),
  );
  await page.goto("/iam-admin/users");
  await expect(page.getByRole("alert")).toContainText("用户列表加载失败");
  await expect(page.getByText("暂无用户", { exact: true })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: /重\s*试/ }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("td").getByRole("button", { name: "查看", exact: true })).toHaveCount(3);
});

test("scoped User detail navigates to the selected Employment without exposing authorization internals", async ({
  page,
}) => {
  const mutations = collectMutationRequests(page);
  await mockScopedManagementApi(page);
  await page.goto("/iam-admin/");
  await expect(page).toHaveURL(/\/iam-admin\/users$/);
  for (const name of [/用户管理/, /职位管理/, /组织管理/, /组织责任/, /雇佣关系/])
    await expect(page.getByRole("menuitem", { name })).toBeVisible();
  for (const name of [/应用管理/, /角色管理/, /会话管理/, /审计日志/, /系统日志/])
    await expect(page.getByRole("menuitem", { name })).toHaveCount(0);
  const viewActions = page.locator("td").getByRole("button", { name: "查看", exact: true });
  await expect(viewActions).toHaveCount(3);
  await expect(page.getByRole("button", { name: /新建用户/ })).toHaveCount(0);
  await viewActions.first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("region", { name: "基本信息" })).toBeVisible();
  for (const action of [/状\s*态/, /离\s*职/]) {
    const button = drawer.getByRole("button", { name: action });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", "该用户仍有范围外的开放任职");
  }
  const remove = drawer.getByRole("button", { name: /删\s*除/ });
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAttribute("title", "当前管理员角色未授予此操作");
  await expect(drawer.getByRole("button", { name: /编\s*辑/ })).toBeEnabled();
  await expect(drawer.getByRole("button", { name: /重\s*置\s*密\s*码/ })).toBeEnabled();
  const panel = drawer.getByRole("region", { name: "雇佣信息" });
  await expect(panel.getByText("财务部")).toBeVisible();
  await expect(panel.getByRole("columnheader", { name: "角色" })).toHaveCount(0);
  await expect(panel.getByRole("columnheader", { name: "权限" })).toHaveCount(0);
  await expect(panel.getByText("iam:hr-admin")).toHaveCount(0);
  await expect(panel.getByText("people:read")).toHaveCount(0);
  const row = panel.getByRole("row").filter({ hasText: "财务部" });
  for (const action of [/转\s*岗/, "取消主岗", /暂\s*停/, /结\s*束/])
    await expect(row.getByRole("button", { name: action })).toBeEnabled();
  await expect(panel.getByRole("button", { name: /新增雇佣/ })).toBeVisible();
  await expect(panel.locator("a").filter({ hasText: "转岗" })).toHaveCount(0);
  await expect(drawer.getByRole("tab", { name: "操作日志" })).toHaveCount(0);
  const position = hrAdminUserDetail.employments[0].position;
  await panel.getByRole("link", { name: `${position.posName} (${position.posCode})` }).click();
  await expect(page).toHaveURL(/\/iam-admin\/employments\?employmentId=42$/);
  const employmentDrawer = page.getByRole("dialog").filter({ hasText: "张三" });
  await expect(employmentDrawer).toBeVisible();
  await employmentDrawer.getByRole("button", { name: "关闭" }).click();
  expect(mutations).toEqual([]);
  let logoutUrl: URL | undefined;
  await page.route("**/sso/logout**", async (route) => {
    logoutUrl = new URL(route.request().url());
    await route.fulfill({ body: "logged out", status: 200 });
  });
  await page.getByText("人事管理员(hradmin)").click();
  await Promise.all([page.waitForURL(/\/sso\/logout\?/), page.getByText("退出登录", { exact: true }).click()]);
  expect(logoutUrl?.pathname).toBe("/sso/logout");
  expect(logoutUrl?.searchParams.get("redirectUrl")).toBe("http://127.0.0.1:8001/iam-admin");
});

test("User Employment history is hidden by default and can be revealed without mutations", async ({ page }) => {
  const mutations = collectMutationRequests(page);
  await mockScopedManagementApi(page);
  const currentEmployment = hrAdminUserDetail.employments[0];
  await page.route("**/rpc/admin.user.detail**", (route) =>
    fulfillTrpc(route, {
      ...hrAdminUserDetail,
      employments: [
        currentEmployment,
        {
          ...currentEmployment,
          id: 43,
          status: EmploymentStatus.Disable,
          isPrimary: false,
          startTime: "2025-01-05T08:00:00.000Z",
          endTime: "2025-12-31T08:00:00.000Z",
          managementPath: null,
          allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Disable, false),
        },
      ],
    }),
  );
  await page.goto("/iam-admin/users");
  await page.locator("td").getByRole("button", { name: "查看", exact: true }).first().click();
  const drawer = page.getByRole("dialog");
  const panel = drawer.getByRole("region", { name: "雇佣信息" });
  const historyFilter = panel.getByRole("checkbox", { name: "显示已结束任职" });
  await expect(historyFilter).not.toBeChecked();
  await expect(panel.getByRole("row")).toHaveCount(2);
  const position = currentEmployment.position;
  await expect(panel.getByRole("link", { name: `${position.posName} (${position.posCode})` })).toBeVisible();
  await historyFilter.check();
  await expect(panel.getByRole("row")).toHaveCount(3);
  await historyFilter.uncheck();
  await expect(panel.getByRole("row")).toHaveCount(2);
  expect(mutations).toEqual([]);
});

test("User basic information is edited and saved in the existing detail", async ({ page }) => {
  await mockScopedManagementApi(page);
  let name = hrAdminUserDetail.name;
  const updates: unknown[] = [];
  await page.route("**/rpc/admin.user.detail**", (route) => fulfillTrpc(route, { ...hrAdminUserDetail, name }));
  await page.route("**/rpc/admin.user.update**", (route) => {
    const input = parseTrpcBatchInput<{ username: string; data: { name: string } }>(route);
    updates.push(input);
    name = input.data.name;
    return fulfillTrpc(route, { changed: true, result: null });
  });
  await page.goto("/iam-admin/users");
  await page.locator("td").getByRole("button", { name: "查看", exact: true }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: /编\s*辑/ }).click();
  const panel = drawer.getByRole("region", { name: "基本信息" });
  const nameField = panel.getByRole("textbox", { name: "姓名" });
  await expect(drawer.getByRole("region", { name: "雇佣信息" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(nameField).toHaveValue(hrAdminUserDetail.name);
  await nameField.fill("未保存姓名");
  await panel.getByRole("button", { name: /取\s*消/ }).click();
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(nameField).toHaveValue("未保存姓名");
  await panel.getByRole("button", { name: /取\s*消/ }).click();
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await drawer.getByRole("button", { name: /编\s*辑/ }).click();
  await expect(nameField).toHaveValue(hrAdminUserDetail.name);
  expect(updates).toEqual([]);
  await nameField.fill("  更新后的姓名  ");
  await panel.getByRole("button", { name: /保\s*存/ }).click();
  await expect(nameField).toHaveCount(0);
  await expect(drawer.getByText("更新后的姓名", { exact: true })).toHaveCount(2);
  await expect(drawer.getByRole("button", { name: /编\s*辑/ })).toBeEnabled();
  expect(updates).toEqual([{ username: hrAdminUserDetail.username, data: { name: "更新后的姓名" } }]);
  await expect(page).toHaveURL(/\/iam-admin\/users$/);
});

test("User operation logs load when selected and preserve the profile draft on return", async ({ page }) => {
  const mutations = collectMutationRequests(page);
  await mockAdminApi(page);
  await page.route("**/rpc/admin.organizationResponsibility.searchAssignments**", (route) =>
    fulfillTrpc(route, { items: [], total: 0, nextCursor: null }),
  );
  const auditSearches: AuditLogSearchParams[] = [];
  await page.route("**/rpc/admin.audit.search**", (route) => {
    auditSearches.push(parseTrpcBatchInput<AuditLogSearchParams>(route));
    return fulfillTrpc(route, { result: [], total: 0 });
  });
  await page.goto("/iam-admin/users");
  await page.locator("td").getByRole("button", { name: "查看", exact: true }).first().click();
  const drawer = page.getByRole("dialog");
  const logs = drawer.getByRole("tab", { name: "操作日志" });
  await expect(logs).toBeVisible();
  expect(auditSearches).toEqual([]);
  await drawer.getByRole("button", { name: /编\s*辑/ }).click();
  const nameField = drawer.getByRole("textbox", { name: "姓名" });
  await nameField.fill("待保存的姓名");
  await logs.click();
  await expect(logs).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("暂无审计日志")).toBeVisible();
  await expect
    .poll(() => auditSearches)
    .toEqual([
      {
        pageNum: 1,
        pageSize: 10,
        conditions: { targetType: "user", targetCode: adminUserDetail.username },
      },
    ]);
  await drawer.getByRole("tab", { name: "用户信息" }).click();
  await expect(nameField).toHaveValue("待保存的姓名");
  await expect(drawer.getByRole("region", { name: "雇佣信息" })).toBeVisible();
  await drawer
    .getByRole("region", { name: "基本信息" })
    .getByRole("button", { name: /取\s*消/ })
    .click();
  expect(mutations).toEqual([]);
});

test("an ended-only disabled User can be rehired only after a refreshed Pause response", async ({ page }) => {
  await mockScopedManagementApi(page);
  let status = UserStatus.Disable;
  const mutations: unknown[] = [];
  await page.route("**/rpc/admin.user.detail**", (route) =>
    fulfillTrpc(route, {
      ...hrAdminUserDetail,
      status,
      employments: [],
      allowedActions: {
        ...hrAdminUserDetail.allowedActions,
        changeStatus: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      },
    }),
  );
  await page.route("**/rpc/admin.employment.create**", (route) => {
    mutations.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, { changed: true, result: { id: 101 } });
  });
  await page.goto("/iam-admin/users");
  await page.locator("td").getByRole("button", { name: "查看", exact: true }).first().click();
  let drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("button", { name: /状\s*态/ })).toBeDisabled();
  await expect(drawer.getByRole("button", { name: /新增雇佣/ })).toBeDisabled();
  // The actual Full Admin -> HR state transition is proved by the PostgreSQL command sequence.
  status = UserStatus.Pause;
  await drawer.getByRole("button", { name: "关闭" }).click();
  await page.locator("td").getByRole("button", { name: "查看", exact: true }).first().click();
  drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: /新增雇佣/ }).click();
  const form = page.getByRole("dialog", { name: /新增雇佣/ });
  await form.getByRole("combobox").nth(1).click();
  await page.getByText("授权根 A (ROOT-A)", { exact: true }).click();
  await form.getByRole("combobox").nth(2).click();
  await page.getByTitle("财务经理 (FIN-001)").click();
  await form.getByRole("button", { name: /确\s*定/ }).click();
  await expect(form).toHaveCount(0);
  expect(mutations).toEqual([
    {
      username: "zhangsan",
      orgCode: "ROOT-A",
      posCode: "FIN-001",
      isPrimary: false,
      description: null,
    },
  ]);
});
