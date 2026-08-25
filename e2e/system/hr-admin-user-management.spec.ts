import { expect, test } from "@playwright/test";
import {
  isSuccessfulRpcResponse,
  loginToAdmin,
} from "./src/admin-client-journey.ts";
import { requireEnvironment } from "./src/environment.ts";

test("HR Admin receives a PostgreSQL-scoped four-module management experience", async ({
  context,
  page,
}) => {
  const origin = requireEnvironment("IAM_E2E_ORIGIN");
  const runId = requireEnvironment("IAM_E2E_RUN_ID");
  const adminClientCode = requireEnvironment("IAM_E2E_ADMIN_CLIENT_CODE");
  const adminPassword = requireEnvironment("IAM_E2E_ADMIN_PASSWORD");
  const hrAdminUsername = requireEnvironment("IAM_E2E_HR_ADMIN_USERNAME");
  const hrAdminUpdatedName = requireEnvironment(
    "IAM_E2E_HR_ADMIN_UPDATED_NAME",
  );
  const inScopeOrganizationCode = requireEnvironment(
    "IAM_E2E_IN_SCOPE_ORGANIZATION_CODE",
  );
  const outsideOrganizationCode = requireEnvironment(
    "IAM_E2E_OUTSIDE_ORGANIZATION_CODE",
  );
  const globalPositionCode = requireEnvironment(
    "IAM_E2E_GLOBAL_POSITION_CODE",
  );
  const scopeRootOrganizationCode = requireEnvironment(
    "IAM_E2E_SCOPE_ROOT_ORGANIZATION_CODE",
  );
  const initialHrAdminName = `E2E HR Admin ${runId}`;
  const scopeRootOrganizationName = `E2E Organization ${runId}`;
  const inScopeOrganizationName = `E2E Responsibility Holder ${runId}`;
  const outsideOrganizationName = `E2E Responsibility Target ${runId}`;

  await loginToAdmin({
    adminPassword,
    adminUsername: hrAdminUsername,
    expectedNavigationText: "用户管理",
    origin,
    page,
  });
  await expect(page).toHaveURL(/\/iam-admin\/users$/u);

  for (const moduleName of ["用户管理", "职位管理", "组织管理", "雇佣关系"]) {
    await expect(page.getByRole("menuitem", { name: moduleName })).toBeVisible();
  }
  for (const moduleName of [
    "组织责任",
    "应用管理",
    "角色管理",
    "会话管理",
    "审计日志",
    "系统日志",
  ]) {
    await expect(page.getByRole("menuitem", { name: moduleName })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: /新建用户/u })).toHaveCount(0);

  await page.getByPlaceholder("工号或姓名").fill(hrAdminUsername);
  const userSearch = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.user.search"));
  await page.getByRole("button", { name: /查\s*询/u }).click();
  await userSearch;
  const userRow = page.getByRole("row").filter({ hasText: hrAdminUsername });
  await expect(userRow).toHaveCount(1);
  await userRow.getByText("查看", { exact: true }).click();

  const userDrawer = page.getByRole("dialog").filter({
    hasText: hrAdminUsername,
  });
  await userDrawer.getByRole("tab", { name: /雇佣/u }).click();
  const employmentPanel = userDrawer.getByRole("tabpanel", { name: /雇佣/u });
  await expect(employmentPanel.getByRole("columnheader", { name: "角色" }))
    .toHaveCount(0);
  await expect(employmentPanel.getByRole("columnheader", { name: "权限" }))
    .toHaveCount(0);
  await expect(employmentPanel.getByText("iam:hr-admin")).toHaveCount(0);
  await expect(employmentPanel.getByRole("button", { name: /转\s*岗/u }))
    .toHaveCount(1);
  await expect(employmentPanel.getByRole("button", { name: /暂\s*停/u }))
    .toHaveCount(1);
  await expect(employmentPanel.getByRole("button", { name: /结\s*束/u }))
    .toHaveCount(1);
  await expect(employmentPanel.getByRole("cell", {
    exact: true,
    name: `${scopeRootOrganizationName} / ${inScopeOrganizationName}`,
  })).toBeVisible();
  await expect(employmentPanel.getByRole("cell", {
    exact: true,
    name: outsideOrganizationName,
  })).toBeVisible();
  await expect(employmentPanel.getByRole("link", { name: "查看任职" }))
    .toHaveCount(1);

  await userDrawer.getByRole("button", { name: /编\s*辑/u }).click();
  const editUserDialog = page.getByRole("dialog", { name: "编辑用户" });
  await editUserDialog.getByRole("textbox", { name: "姓名" })
    .fill(hrAdminUpdatedName);
  const updateResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.user.update"));
  await editUserDialog.getByRole("button", { name: /确\s*定/u }).click();
  await updateResponse;
  await expect(page.getByText("更新成功", { exact: true })).toBeVisible();
  await expect(userRow.getByRole("cell", { name: hrAdminUpdatedName }))
    .toBeVisible();

  await page.goto("/iam-admin/positions");
  const positionRow = page.getByRole("row").filter({
    hasText: globalPositionCode,
  });
  await expect(positionRow).toHaveCount(1);
  await expect(positionRow.locator("td").last().locator("a")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /新建岗位/u })).toHaveCount(0);

  await page.goto("/iam-admin/organizations");
  await expect(page.getByText(`(${scopeRootOrganizationCode})`, { exact: true }))
    .toBeVisible();
  await expect(page.getByText(`(${outsideOrganizationCode})`, { exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: /新建根组织/u })).toHaveCount(0);

  await page.goto("/iam-admin/employments");
  await page.getByPlaceholder("工号或姓名").fill(hrAdminUsername);
  const employmentSearch = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.employment.search"));
  await page.getByRole("button", { name: /查\s*询/u }).click();
  await employmentSearch;
  const visibleEmploymentRows = page.getByRole("row").filter({
    hasText: hrAdminUsername,
  });
  await expect(visibleEmploymentRows).toHaveCount(1);
  await expect(visibleEmploymentRows.getByText(inScopeOrganizationName))
    .toBeVisible();
  await expect(page.getByText(outsideOrganizationName)).toHaveCount(0);

  const denial = await context.request.put(
    `${origin}/api/iam/admin/organizations/${encodeURIComponent(outsideOrganizationCode)}`,
    {
      data: { orgName: `Forbidden Outside Update ${runId}` },
      headers: { Client: adminClientCode },
    },
  );
  expect(denial.status()).toBe(404);

  const hiddenRoutes = [
    "organization-responsibilities/types",
    "clients",
    "roles",
    "sessions",
    "audit-logs",
    "system-logs",
  ];
  for (const route of hiddenRoutes) {
    await page.goto(`/iam-admin/${route}`);
    await expect(page.getByText("抱歉，你无权访问该页面")).toBeVisible();
  }

  await page.goto("/iam-admin/");
  await expect(page).toHaveURL(/\/iam-admin\/users$/u);
  await page.getByText(`${hrAdminUpdatedName}(${hrAdminUsername})`, {
    exact: true,
  }).click();
  await page.getByText("退出登录", { exact: true }).click();
  await expect(page.getByLabel("工号 / 账号")).toBeVisible();

  expect(inScopeOrganizationCode).not.toBe(outsideOrganizationCode);
  expect(initialHrAdminName).not.toBe(hrAdminUpdatedName);
});
