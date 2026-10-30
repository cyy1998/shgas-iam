// Browser Integration uses a mocked backend; this is not a full-system journey.
import { UserStatus } from "@iam/contracts";
import { expect, test } from "@playwright/test";
import { hrAdminUserDetail } from "../../test/mocks/fixtures";
import { fulfillTrpc, parseTrpcBatchInput } from "../fixtures";
import { collectMutationRequests, mockScopedManagementApi } from "../scoped-management.fixture";

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
  await drawer.getByRole("tab", { name: /雇佣/ }).click();
  const panel = drawer.getByRole("tabpanel", { name: /雇佣/ });
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
  await panel.getByRole("link", { name: "查看任职" }).click();
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
  await drawer.getByRole("tab", { name: /雇佣/ }).click();
  await expect(drawer.getByRole("button", { name: /新增雇佣/ })).toBeDisabled();
  // The actual Full Admin -> HR state transition is proved by the PostgreSQL command sequence.
  status = UserStatus.Pause;
  await drawer.getByRole("button", { name: "关闭" }).click();
  await page.locator("td").getByRole("button", { name: "查看", exact: true }).first().click();
  drawer = page.getByRole("dialog");
  await drawer.getByRole("tab", { name: /雇佣/ }).click();
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
