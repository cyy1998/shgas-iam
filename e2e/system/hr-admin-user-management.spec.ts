import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  expectRpcMutationResult,
  isSuccessfulRpcResponse,
  loginToAdmin,
} from "./src/admin-client-journey.ts";
import { containsScalarValue } from "./src/concealment.ts";
import { requireEnvironment } from "./src/environment.ts";

const safeBlockerMessage
  = "存在当前管理员不可管理的开放责任任命，请联系完整管理员处理";

test("HR Admin manages cross-root responsibilities without widening either endpoint", async ({
  browser,
  context,
  page,
}) => {
  const scenario = readScenario();
  await expectMixedAndFullAdminGlobalCapability(browser, scenario);
  await loginToAdmin({
    adminPassword: scenario.adminPassword,
    adminUsername: scenario.hrAdminUsername,
    expectedNavigationText: "组织责任",
    origin: scenario.origin,
    page,
  });
  await expect(page).toHaveURL(/\/iam-admin\//u);

  for (const moduleName of [
    "用户管理",
    "职位管理",
    "组织管理",
    "雇佣关系",
    "组织责任",
  ]) {
    await expect(page.getByRole("menuitem", { name: moduleName })).toBeVisible();
  }
  for (const moduleName of [
    "应用管理",
    "角色管理",
    "会话管理",
    "审计日志",
    "系统日志",
  ]) {
    await expect(page.getByRole("menuitem", { name: moduleName })).toHaveCount(0);
  }

  await page.goto("/iam-admin/organization-responsibilities/types");
  await expect(page.getByRole("row").filter({ hasText: "head" }))
    .toContainText("负责人");
  await expect(page.getByRole("row").filter({ hasText: "supervising" }))
    .toContainText("分管领导");

  await page.goto("/iam-admin/organization-responsibilities/assignments");
  await page.getByRole("button", { name: /新建责任任命/u }).click();
  const createDialog = page.getByRole("dialog", { name: "新建责任任命" });
  const formItem = (label: string) =>
    createDialog.locator(".ant-form-item").filter({ hasText: label });

  const targetSelector = formItem("目标组织").getByRole("combobox");
  const outsideTargetSearch = waitForRpc(page, "admin.organization.selector");
  await targetSelector.fill(scenario.outsideOrganizationCode);
  await outsideTargetSearch;
  await expect(page.getByText(new RegExp(
    escapeRegExp(scenario.outsideOrganizationCode),
    "u",
  ))).toHaveCount(0);
  const inScopeTargetSearch = waitForRpc(page, "admin.organization.selector");
  await targetSelector.fill(scenario.hrResponsibilityTargetOrganizationCode);
  await inScopeTargetSearch;
  await page.getByText(new RegExp(
    escapeRegExp(scenario.hrResponsibilityTargetOrganizationCode),
    "u",
  )).last().click();

  await formItem("责任类型").getByRole("combobox").click();
  await page.getByTitle("分管领导").click();
  const employmentSelector = formItem("任职").getByRole("combobox");
  const employmentSearch = waitForRpc(page, "admin.employment.search");
  await employmentSelector.fill(scenario.adminUsername);
  await employmentSearch;
  await expect(page.getByTitle(new RegExp(
    escapeRegExp(scenario.outsideResponsibilityHolderPositionCode),
    "u",
  ))).toHaveCount(0);
  await page.getByTitle(new RegExp(
    escapeRegExp(scenario.responsibilityHolderPositionCode),
    "u",
  )).click();
  const createResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(
      response,
      "admin.organizationResponsibility.createAssignment",
    ));
  await createDialog.getByRole("button", { name: /确\s*定/u }).click();
  const creation = await createResponse;
  await expect(page.getByText("责任任命已创建", { exact: true })).toBeVisible();

  const created = await findCreatedAssignment(context.request, scenario);
  await expectRpcMutationResult(creation, "admin.organizationResponsibility.createAssignment", true, {
    id: created.id,
  });
  await expectManualTransportMatrix(context.request, scenario);
  await expectContextPanels(page, scenario, created.id);
  await manageLifecycle(page, created.id);
  await expectRepeatedEnd(context.request, scenario, created.id);

  await page.goto(
    `/iam-admin/organization-responsibilities/assignments?lifecycle=all&assignment=${scenario.hiddenResponsibilityAssignmentId}`,
  );
  const concealedDrawer = page.getByRole("dialog");
  await expect(concealedDrawer.getByRole("alert").filter({
    hasText: "组织责任任命不存在",
  })).toHaveCount(1);
  await expect(concealedDrawer).not.toContainText(
    scenario.outsideResponsibilityHolderPositionCode,
  );
  await expect(concealedDrawer).not.toContainText(
    scenario.outsideOrganizationCode,
  );
  await page.keyboard.press("Escape");
  await expect(concealedDrawer).toBeHidden();

  await expectSafeBlockers(page, context.request, scenario);

  const auditResponse = await context.request.post(
    `${scenario.origin}/api/iam/admin/audit-logs/search`,
    {
      data: { pageNum: 1, pageSize: 10, conditions: {} },
      headers: adminHeaders(scenario.adminClientCode),
    },
  );
  expect(auditResponse.status()).toBe(403);

  await revokeSecondScopeWithFullAdmin(browser, scenario);
  const revokedDetail = await context.request.get(
    `${scenario.origin}/api/iam/admin/organization-responsibilities/assignments/${created.id}`,
    { headers: adminHeaders(scenario.adminClientCode) },
  );
  expect(revokedDetail.status()).toBe(404);
  const revokedList = await searchAssignments(context.request, scenario, {
    lifecycle: "all",
    targetOrganizationCode: scenario.hrResponsibilityTargetOrganizationCode,
  });
  expect(revokedList.items).toEqual([]);
  const revokedMutation = await context.request.post(
    `${scenario.origin}/api/iam/admin/organization-responsibilities/assignments/${created.id}/end`,
    { headers: adminHeaders(scenario.adminClientCode) },
  );
  expect(revokedMutation.status()).toBe(404);

  await expectActorFailClosed(browser, scenario, scenario.delegateeUsername);
  await expectActorFailClosed(
    browser,
    scenario,
    scenario.noScopeHrAdminUsername,
  );
});

async function expectContextPanels(
  page: Page,
  scenario: Scenario,
  assignmentId: number,
) {
  const targetName = `E2E HR Responsibility Target ${scenario.runId}`;
  await page.goto("/iam-admin/organizations");
  const organizationSearch = page.getByPlaceholder("搜索组织名称或编码");
  await organizationSearch.fill(scenario.hrResponsibilityTargetOrganizationCode);
  await page.getByText(new RegExp(
    escapeRegExp(scenario.hrResponsibilityTargetOrganizationCode),
    "u",
  )).last().click();
  await page.getByRole("tab", { name: "责任任命" }).click();
  await expect(page.getByRole("row").filter({ hasText: "分管领导" }))
    .toContainText(targetName);

  await page.goto("/iam-admin/employments");
  await page.getByPlaceholder("工号或姓名").fill(scenario.adminUsername);
  const employmentSearch = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.employment.search"));
  await page.getByRole("button", { name: /查\s*询/u }).click();
  await employmentSearch;
  const holderRow = page.getByRole("row").filter({
    hasText: scenario.responsibilityHolderPositionCode,
  });
  await holderRow.getByText("查看", { exact: true }).click();
  const employmentDrawer = page.getByRole("dialog");
  await employmentDrawer.getByRole("tab", { name: "组织责任" }).click();
  await expect(employmentDrawer.getByText(targetName, { exact: true }))
    .toBeVisible();
  await expect(employmentDrawer.getByLabel(`查看任命 #${assignmentId}`))
    .toBeVisible();
  await employmentDrawer.getByRole("button", { name: "关闭" }).click();

  await page.goto("/iam-admin/users");
  await page.getByPlaceholder("工号或姓名").fill(scenario.adminUsername);
  const userSearch = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.user.search"));
  await page.getByRole("button", { name: /查\s*询/u }).click();
  await userSearch;
  await page.getByRole("row").filter({ hasText: scenario.adminUsername }).getByText("查看", { exact: true }).click();
  const userDrawer = page.getByRole("dialog").filter({
    hasText: scenario.adminUsername,
  });
  await userDrawer.getByRole("tab", { name: /雇佣/u }).click();
  await expect(userDrawer.getByText(targetName, { exact: true })).toBeVisible();
  await expect(userDrawer.getByLabel(`查看任命 #${assignmentId}`)).toBeVisible();
  await userDrawer.getByRole("button", { name: "关闭" }).click();
}

async function manageLifecycle(page: Page, assignmentId: number) {
  await page.goto(
    `/iam-admin/organization-responsibilities/assignments?lifecycle=open&assignment=${assignmentId}`,
  );
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText(`任命 #${assignmentId}`, { exact: true }))
    .toBeVisible();
  await expect(drawer.getByRole("tab", { name: "操作日志" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "暂停任命" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "结束任命" })).toBeVisible();

  const pauseResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.organizationResponsibility.pauseAssignment"));
  await drawer.getByRole("button", { name: "暂停任命" }).click();
  await expectRpcMutationResult(await pauseResponse, "admin.organizationResponsibility.pauseAssignment", true, null);
  await expect(page.getByText("责任任命已暂停", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "恢复任命" })).toBeVisible();

  const resumeResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.organizationResponsibility.resumeAssignment"));
  await drawer.getByRole("button", { name: "恢复任命" }).click();
  await expectRpcMutationResult(await resumeResponse, "admin.organizationResponsibility.resumeAssignment", true, null);
  await expect(page.getByText("责任任命已恢复", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "暂停任命" })).toBeVisible();

  await drawer.getByRole("button", { name: "结束任命" }).click();
  const endResponse = page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, "admin.organizationResponsibility.endAssignment"));
  await page.locator(".ant-modal-confirm").getByRole("button", {
    name: "确认结束",
  }).click();
  await expectRpcMutationResult(await endResponse, "admin.organizationResponsibility.endAssignment", true, null);
  const endedMessage = page.getByText("责任任命已结束", { exact: true });
  await expect(endedMessage).toBeVisible();
  await expect(drawer.getByText("已结束", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "暂停任命" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "恢复任命" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "结束任命" })).toHaveCount(0);
  await expect(endedMessage).toBeHidden();
  await drawer.getByRole("button", { name: "关闭" }).click();

  await page.goto(
    `/iam-admin/organization-responsibilities/assignments?lifecycle=ended&assignment=${assignmentId}`,
  );
  await expect(page.locator(".ant-table-tbody").getByRole("row")
    .filter({ hasText: "已结束" }))
    .toHaveCount(1);
  await expect(page.getByRole("dialog").getByText(
    `任命 #${assignmentId}`,
    { exact: true },
  )).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();
}

async function expectRepeatedEnd(
  request: APIRequestContext,
  scenario: Scenario,
  assignmentId: number,
) {
  const detailUrl = `${scenario.origin}/api/iam/admin/organization-responsibilities/assignments/${assignmentId}`;
  const headers = adminHeaders(scenario.adminClientCode);
  const before = await request.get(detailUrl, { headers });
  expect(before.status()).toBe(200);
  const beforeBody = await before.json();
  expect(beforeBody.data.endTime).toEqual(expect.any(String));
  const repeatedRest = await request.post(`${detailUrl}/end`, { headers });
  expect(repeatedRest.status()).toBe(200);
  expect(await repeatedRest.json()).toMatchObject({ data: { changed: false, result: null } });
  const repeatedTrpc = await postAdminTrpcMutation(
    request,
    scenario,
    "admin.organizationResponsibility.endAssignment",
    { id: assignmentId },
  );
  await expectRpcMutationResult(repeatedTrpc, "admin.organizationResponsibility.endAssignment", false, null);
  const after = await request.get(detailUrl, { headers });
  expect(after.status()).toBe(200);
  expect((await after.json()).data).toEqual(beforeBody.data);
}

async function expectManualTransportMatrix(
  request: APIRequestContext,
  scenario: Scenario,
) {
  const cases = [
    {
      name: "in/in",
      employmentId: scenario.responsibilityHolderEmploymentId,
      targetOrganizationCode:
        scenario.hrResponsibilityTargetOrganizationCode,
      expectedStatus: 409,
    },
    {
      name: "in/out",
      employmentId: scenario.responsibilityHolderEmploymentId,
      targetOrganizationCode: scenario.outsideOrganizationCode,
      expectedStatus: 404,
    },
    {
      name: "out/in",
      employmentId: scenario.outsideResponsibilityHolderEmploymentId,
      targetOrganizationCode: scenario.hrResponsibilityTargetOrganizationCode,
      expectedStatus: 404,
    },
    {
      name: "out/out",
      employmentId: scenario.outsideResponsibilityHolderEmploymentId,
      targetOrganizationCode: scenario.outsideOrganizationCode,
      expectedStatus: 404,
    },
  ];
  for (const denialCase of cases) {
    const response = await request.post(
      `${scenario.origin}/api/iam/admin/organizations/${encodeURIComponent(denialCase.targetOrganizationCode)}/responsibility-assignments`,
      {
        data: {
          employmentId: denialCase.employmentId,
          typeCode: "supervising",
        },
        headers: adminHeaders(scenario.adminClientCode),
      },
    );
    expect(response.status(), `REST ${denialCase.name}`)
      .toBe(denialCase.expectedStatus);
    assertConcealedResponse(await response.json(), scenario);

    const trpcResponse = await postAdminTrpcMutation(
      request,
      scenario,
      "admin.organizationResponsibility.createAssignment",
      {
        employmentId: denialCase.employmentId,
        orgCode: denialCase.targetOrganizationCode,
        typeCode: "supervising",
      },
    );
    expect(trpcResponse.status(), `tRPC ${denialCase.name}`)
      .toBe(denialCase.expectedStatus);
    assertConcealedResponse(await trpcResponse.json(), scenario);
  }

  const hiddenLifecycle = await request.post(
    `${scenario.origin}/api/iam/admin/organization-responsibilities/assignments/${scenario.hiddenResponsibilityAssignmentId}/pause`,
    { headers: adminHeaders(scenario.adminClientCode) },
  );
  expect(hiddenLifecycle.status()).toBe(404);
  assertConcealedResponse(await hiddenLifecycle.json(), scenario);
}

async function postAdminTrpcMutation(
  request: APIRequestContext,
  scenario: Scenario,
  procedure: string,
  input: Record<string, number | string>,
) {
  return await request.post(
    `${scenario.origin}/api/iam/rpc/${procedure}?batch=1`,
    {
      data: { 0: input },
      headers: {
        ...adminHeaders(scenario.adminClientCode),
        "Content-Type": "application/json",
      },
    },
  );
}

function assertConcealedResponse(body: unknown, scenario: Scenario) {
  expect(containsScalarValue(
    body,
    scenario.outsideResponsibilityHolderPositionCode,
  )).toBe(false);
  expect(containsScalarValue(
    body,
    scenario.hiddenResponsibilityAssignmentId,
  )).toBe(false);
}

async function expectSafeBlockers(
  page: Page,
  request: APIRequestContext,
  scenario: Scenario,
) {
  const cardinality = await request.post(
    `${scenario.origin}/api/iam/admin/organizations/${encodeURIComponent(scenario.hrResponsibilityTargetOrganizationCode)}/responsibility-assignments`,
    {
      data: {
        employmentId: scenario.responsibilityHolderEmploymentId,
        typeCode: "head",
      },
      headers: adminHeaders(scenario.adminClientCode),
    },
  );
  expect(cardinality.status()).toBe(409);
  const body = JSON.stringify(await cardinality.json());
  expect(body).toContain("ASSIGNMENT_UNMANAGEABLE_CONFLICT");
  expect(body).not.toContain(scenario.outsideResponsibilityHolderPositionCode);
  expect(body).not.toContain(String(scenario.hiddenResponsibilityAssignmentId));

  await page.goto("/iam-admin/organizations");
  await page.getByPlaceholder("搜索组织名称或编码")
    .fill(scenario.hrResponsibilityTargetOrganizationCode);
  await page.getByText(new RegExp(
    escapeRegExp(scenario.hrResponsibilityTargetOrganizationCode),
    "u",
  )).last().click();
  await page.getByRole("button", { name: /状\s*态/u }).hover();
  await expect(page.getByText(safeBlockerMessage, { exact: true })).toBeVisible();
  await expect(page.getByText(
    scenario.outsideResponsibilityHolderPositionCode,
    { exact: false },
  )).toHaveCount(0);
}

async function expectMixedAndFullAdminGlobalCapability(
  browser: Browser,
  scenario: Scenario,
) {
  const adminContext = await browser.newContext({ baseURL: scenario.origin });
  try {
    const adminPage = await adminContext.newPage();
    await loginToAdmin({
      adminPassword: scenario.adminPassword,
      adminUsername: scenario.adminUsername,
      origin: scenario.origin,
      page: adminPage,
    });
    const globalDetail = await adminContext.request.get(
      `${scenario.origin}/api/iam/admin/organization-responsibilities/assignments/${scenario.hiddenResponsibilityAssignmentId}`,
      { headers: adminHeaders(scenario.adminClientCode) },
    );
    expect(globalDetail.status()).toBe(200);
    const mixedMutation = await adminContext.request.post(
      `${scenario.origin}/api/iam/admin/organization-responsibilities/assignments/${scenario.hiddenResponsibilityAssignmentId}/pause`,
      { headers: adminHeaders(scenario.adminClientCode) },
    );
    expect(mixedMutation.status()).toBe(200);
    const removeMixedRole = await adminContext.request.delete(
      `${scenario.origin}/api/iam/admin/roles/${encodeURIComponent("iam:hr-admin")}/assignments/${scenario.adminMixedRoleAssignmentId}`,
      { headers: adminHeaders(scenario.adminClientCode) },
    );
    expect(removeMixedRole.status()).toBe(200);
    const fullDetail = await adminContext.request.get(
      `${scenario.origin}/api/iam/admin/organization-responsibilities/assignments/${scenario.hiddenResponsibilityAssignmentId}`,
      { headers: adminHeaders(scenario.adminClientCode) },
    );
    expect(fullDetail.status()).toBe(200);
    const fullMutation = await adminContext.request.post(
      `${scenario.origin}/api/iam/admin/organization-responsibilities/assignments/${scenario.hiddenResponsibilityAssignmentId}/resume`,
      { headers: adminHeaders(scenario.adminClientCode) },
    );
    expect(fullMutation.status()).toBe(200);
  }
  finally {
    await adminContext.close();
  }
}

async function revokeSecondScopeWithFullAdmin(
  browser: Browser,
  scenario: Scenario,
) {
  const adminContext = await browser.newContext({ baseURL: scenario.origin });
  try {
    const adminPage = await adminContext.newPage();
    await loginToAdmin({
      adminPassword: scenario.adminPassword,
      adminUsername: scenario.adminUsername,
      origin: scenario.origin,
      page: adminPage,
    });
    const revoke = await adminContext.request.delete(
      `${scenario.origin}/api/iam/admin/roles/${encodeURIComponent("iam:hr-admin")}/assignments/${scenario.hrSecondScopeRoleAssignmentId}`,
      { headers: adminHeaders(scenario.adminClientCode) },
    );
    expect(revoke.status()).toBe(200);
  }
  finally {
    await adminContext.close();
  }
}

async function expectActorFailClosed(
  browser: Browser,
  scenario: Scenario,
  username: string,
) {
  const actorContext = await browser.newContext({ baseURL: scenario.origin });
  try {
    const actorPage = await actorContext.newPage();
    await loginToAdmin({
      adminPassword: scenario.adminPassword,
      adminUsername: username,
      expectedNavigationText: "组织责任",
      origin: scenario.origin,
      page: actorPage,
    });
    const response = await actorContext.request.get(
      `${scenario.origin}/api/iam/admin/organization-responsibilities/types`,
      { headers: adminHeaders(scenario.adminClientCode) },
    );
    expect(response.status()).toBe(403);
  }
  finally {
    await actorContext.close();
  }
}

async function findCreatedAssignment(
  request: APIRequestContext,
  scenario: Scenario,
) {
  const result = await searchAssignments(request, scenario, {
    employmentId: scenario.responsibilityHolderEmploymentId,
    lifecycle: "open",
    targetOrganizationCode: scenario.hrResponsibilityTargetOrganizationCode,
    typeCode: "supervising",
  });
  expect(result.items).toHaveLength(1);
  const assignment = result.items[0];
  if (assignment === undefined)
    throw new Error("HR Admin cross-root Assignment was not returned");
  return assignment;
}

async function searchAssignments(
  request: APIRequestContext,
  scenario: Scenario,
  filters: Record<string, number | string>,
) {
  const url = new URL(
    "/api/iam/admin/organization-responsibilities/assignments",
    scenario.origin,
  );
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, String(value));
  }
  const response = await request.get(url.href, {
    headers: adminHeaders(scenario.adminClientCode),
  });
  expect(response.status()).toBe(200);
  const body = await response.json() as {
    data: { items: Array<{ id: number }>; nextCursor: string | null };
  };
  return body.data;
}

async function waitForRpc(page: Page, procedure: string) {
  await page.waitForResponse(response =>
    isSuccessfulRpcResponse(response, procedure));
}

function adminHeaders(clientCode: string) {
  return { Client: clientCode };
}

function readScenario() {
  return {
    origin: requireEnvironment("IAM_E2E_ORIGIN"),
    runId: requireEnvironment("IAM_E2E_RUN_ID"),
    adminClientCode: requireEnvironment("IAM_E2E_ADMIN_CLIENT_CODE"),
    adminMixedRoleAssignmentId: Number(requireEnvironment(
      "IAM_E2E_ADMIN_MIXED_ROLE_ASSIGNMENT_ID",
    )),
    adminPassword: requireEnvironment("IAM_E2E_ADMIN_PASSWORD"),
    adminUsername: requireEnvironment("IAM_E2E_ADMIN_USERNAME"),
    hrAdminUsername: requireEnvironment("IAM_E2E_HR_ADMIN_USERNAME"),
    delegateeUsername: requireEnvironment("IAM_E2E_DELEGATEE_USERNAME"),
    noScopeHrAdminUsername: requireEnvironment(
      "IAM_E2E_NO_SCOPE_HR_ADMIN_USERNAME",
    ),
    responsibilityHolderPositionCode: requireEnvironment(
      "IAM_E2E_RESPONSIBILITY_HOLDER_POSITION_CODE",
    ),
    outsideResponsibilityHolderPositionCode: requireEnvironment(
      "IAM_E2E_OUTSIDE_RESPONSIBILITY_HOLDER_POSITION_CODE",
    ),
    responsibilityHolderEmploymentId: Number(requireEnvironment(
      "IAM_E2E_RESPONSIBILITY_HOLDER_EMPLOYMENT_ID",
    )),
    outsideResponsibilityHolderEmploymentId: Number(requireEnvironment(
      "IAM_E2E_OUTSIDE_RESPONSIBILITY_HOLDER_EMPLOYMENT_ID",
    )),
    hiddenResponsibilityAssignmentId: Number(requireEnvironment(
      "IAM_E2E_HIDDEN_RESPONSIBILITY_ASSIGNMENT_ID",
    )),
    hrSecondScopeRoleAssignmentId: Number(requireEnvironment(
      "IAM_E2E_HR_SECOND_SCOPE_ROLE_ASSIGNMENT_ID",
    )),
    hrResponsibilityTargetOrganizationCode: requireEnvironment(
      "IAM_E2E_HR_RESPONSIBILITY_TARGET_ORGANIZATION_CODE",
    ),
    outsideOrganizationCode: requireEnvironment(
      "IAM_E2E_OUTSIDE_ORGANIZATION_CODE",
    ),
  };
}

type Scenario = ReturnType<typeof readScenario>;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
