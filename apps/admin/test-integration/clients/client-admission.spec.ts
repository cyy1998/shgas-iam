import type { ClientSsoDetail } from "@admin/services/client-sso";
import { ApiErrorCode, UserType } from "@iam/contracts";
import { expect, test } from "@playwright/test";
import { adminClientDetail, adminUserSearchResult } from "../../test/mocks/fixtures";
import { fulfillJson, fulfillTrpc, mockAdminApi, parseTrpcBatchInput } from "../fixtures";

const allowedActions = { save: true, preview: true, setEnabled: true };

test("admission refreshes actions after saving and retains a draft on rejected or uncertain writes", async ({
  page,
}) => {
  await mockAdminApi(page, {
    clientDetail: { ...adminClientDetail, clientCode: "expense", clientName: "报销" },
  });
  let actions = { ...allowedActions };
  let saved = { field: "username", op: "eq", value: "saved" };
  let saves = 0;
  const refreshing = Promise.withResolvers<void>();
  const releaseRefresh = Promise.withResolvers<void>();
  const failures = [
    { code: "FORBIDDEN", httpStatus: 403, notice: /准入策略操作已被拒绝/ },
    { code: "SERVICE_UNAVAILABLE", httpStatus: 503, notice: /准入策略服务暂时不可用/ },
    { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, notice: /操作结果未确认/ },
  ];
  await page.route("**/rpc/admin.clientAdmission.detail**", async (route) => {
    if (!actions.save) {
      refreshing.resolve();
      await releaseRefresh.promise;
    }
    await fulfillTrpc(route, { enabled: false, filter: saved, allowedActions: actions });
  });
  await page.route("**/rpc/admin.clientAdmission.save**", (route) => {
    const failure = failures[saves++];
    if (failure) {
      return fulfillJson(route, [
        {
          error: { message: failure.code, code: -32603, data: { code: failure.code, httpStatus: failure.httpStatus } },
        },
      ]);
    }
    const input = parseTrpcBatchInput<{ data: { filter: typeof saved } }>(route);
    saved = input.data.filter;
    actions = { save: false, preview: false, setEnabled: false };
    return fulfillTrpc(route, { changed: true, result: { enabled: false, filter: saved } });
  });
  await page.goto("/iam-admin/clients/expense/edit?section=admission");
  const condition = page.getByLabel("条件值", { exact: true });
  const save = page.getByRole("button", { name: "保存条件" });
  const enable = page.getByRole("button", { name: "开启准入策略" });
  const user = page.getByRole("combobox", { name: "试算用户" });
  await expect(enable).toBeEnabled();
  await expect(user).toBeEnabled();
  await condition.fill("draft");
  for (const failure of failures) {
    await save.click();
    await expect(page.getByText(failure.notice)).toBeVisible();
    await expect(condition).toHaveValue("draft");
    await expect(save).toBeEnabled();
  }
  await save.click();
  try {
    await Promise.race([
      refreshing.promise,
      page.waitForEvent("close").then(() => {
        throw new Error("Browser closed before refreshing admission actions");
      }),
    ]);
    await expect(enable).toBeDisabled();
    await expect(user).toBeDisabled();
  } finally {
    releaseRefresh.resolve();
  }
  await expect(page.getByText("准入条件已保存")).toBeVisible();
  await expect(enable).toBeDisabled();
  await expect(user).toBeDisabled();
  await expect(condition).toBeDisabled();
  await expect(condition).toHaveValue("draft");
  expect(saves).toBe(4);
});

test("application admission can be reopened with the saved condition and reports a committed propagation failure", async ({
  page,
}) => {
  await mockAdminApi(page, {
    clientDetail: { ...adminClientDetail, clientCode: "expense", clientName: "报销" },
  });
  const filter = { field: "username", op: "eq", value: "employee" };
  const sso: ClientSsoDetail = {
    ...adminClientDetail,
    clientCode: "expense",
    clientName: "报销",
    ssoConfig: null,
    ssoEnabled: false,
    hasSsoSecret: false,
    allowedActions: { save: true, selectProtocol: true, setEnabled: true, rotateSecret: true, readSecret: true },
  };
  await page.route("**/rpc/admin.clientSso.detail**", (route) => fulfillTrpc(route, sso));
  let policy: { enabled: boolean; filter: typeof filter | null } = { enabled: false, filter: null };
  const toggles: boolean[] = [];
  const releaseCommittedResponse = Promise.withResolvers<void>();
  await page.route("**/rpc/admin.clientAdmission.detail**", (route) =>
    fulfillTrpc(route, { ...policy, allowedActions }),
  );
  await page.route("**/rpc/admin.clientAdmission.save**", (route) => {
    const input = parseTrpcBatchInput<{ data: { filter: typeof filter } }>(route);
    expect(input.data.filter).toEqual(filter);
    policy = { ...policy, filter: input.data.filter };
    return fulfillTrpc(route, { changed: true, result: policy });
  });
  await page.route("**/rpc/admin.clientAdmission.setEnabled**", async (route) => {
    const input = parseTrpcBatchInput<{ clientCode: string; data: { enabled: boolean } }>(route);
    expect(input.clientCode).toBe("expense");
    policy = { ...policy, enabled: input.data.enabled };
    toggles.push(policy.enabled);
    if (toggles.length < 3) return fulfillTrpc(route, { changed: true, result: { enabled: policy.enabled } });
    await releaseCommittedResponse.promise;
    return fulfillJson(route, [
      {
        error: {
          message: "Committed",
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            path: "admin.clientAdmission.setEnabled",
            serviceCode: ApiErrorCode.AdminMutationCommitted,
          },
        },
      },
    ]);
  });

  const enable = page.getByRole("button", { name: "开启准入策略" });
  const disable = page.getByRole("button", { name: "关闭准入策略" });
  const condition = page.getByLabel("条件值", { exact: true });
  await page.goto("/iam-admin/clients/expense/edit?section=admission");
  await expect(enable).toBeDisabled();
  await page.getByLabel("字段", { exact: true }).click();
  await page.getByTitle("账号", { exact: true }).click();
  await condition.fill(filter.value);
  await expect(enable).toBeDisabled();
  await page.getByRole("button", { name: "保存条件" }).click();
  await enable.click();
  await expect(page.getByText("状态：已开启")).toBeVisible();
  await disable.click();
  await expect(page.getByText("状态：已关闭")).toBeVisible();
  await expect(condition).toHaveValue(filter.value);
  const pendingEnable = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("admin.clientAdmission.setEnabled"),
  );
  try {
    await enable.click();
    await pendingEnable;
    await page.getByRole("tab", { name: "SSO 配置" }).click();
    await expect(page.getByRole("button", { name: "保存协议及配置" })).toBeEnabled();
  } finally {
    releaseCommittedResponse.resolve();
  }
  await expect(page.getByText(/操作已提交，但缓存同步失败或未确认/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("tab", { name: "应用准入" }).click();
  await expect(page.getByText(/操作已提交，但缓存同步失败或未确认/)).toBeVisible();
  await expect(page.getByText("状态：已开启")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/操作已提交，但缓存同步失败或未确认/)).toBeVisible();
  await expect(page.getByText("状态：已开启")).toBeVisible();
  await expect(condition).toHaveValue(filter.value);
  await page.getByRole("tab", { name: "SSO 配置" }).click();
  await expect(page.getByText(/操作已提交，但缓存同步失败或未确认/)).toBeVisible();
  await expect(page.getByRole("button", { name: "保存协议及配置" })).toBeEnabled();
  expect(toggles).toEqual([true, false, true]);
});

test("a disabled application can preview an unsaved condition, then save and reopen it", async ({ page }) => {
  const user = adminUserSearchResult.result[0];
  if (!user) throw new Error("Missing selected user fixture");
  await mockAdminApi(page, {
    clientDetail: { ...adminClientDetail, clientCode: "expense", clientName: "报销" },
  });

  const previews: unknown[] = [];
  const saves: unknown[] = [];
  const formal = { field: "userType", op: "eq", value: UserType.Formal };
  const external = { ...formal, value: UserType.External };
  let documentAvailable = true;
  let policy = { enabled: false, filter: null as typeof formal | null };
  await page.route("**/rpc/admin.clientAdmission.detail**", (route) =>
    fulfillTrpc(route, { ...policy, allowedActions }),
  );
  await page.route("**/rpc/admin.clientAdmission.preview**", (route) => {
    const input = parseTrpcBatchInput<{ clientCode: string; data: { userId: number; filter: typeof formal } }>(route);
    previews.push(input);
    const status = documentAvailable
      ? input.data.filter.value === UserType.Formal
        ? "match"
        : "no-match"
      : "unavailable";
    return fulfillTrpc(route, { status });
  });
  await page.route("**/rpc/admin.clientAdmission.save**", (route) => {
    const input = parseTrpcBatchInput<{ clientCode: string; data: { filter: typeof formal } }>(route);
    saves.push(input);
    policy = { ...policy, filter: input.data.filter };
    return fulfillTrpc(route, { changed: true, result: policy });
  });

  await page.goto("/iam-admin/clients/expense/edit?section=basic");
  await page.getByRole("tab", { name: "应用准入" }).click({ timeout: 12_000 });
  await page.getByLabel("用户类型", { exact: true }).click({ timeout: 12_000 });
  await page.getByTitle(UserType.Formal, { exact: true }).click({ timeout: 12_000 });

  const userSelect = page.getByRole("combobox", { name: "试算用户" });
  await userSelect.fill(user.username, { timeout: 12_000 });
  await page.getByTitle(`${user.name} (${user.username})`, { exact: true }).click({ timeout: 12_000 });
  await page.getByRole("button", { name: /^试\s*算$/ }).click({ timeout: 12_000 });
  await expect(page.getByRole("status")).toHaveText("匹配", { timeout: 12_000 });
  expect(previews).toEqual([{ clientCode: "expense", data: { userId: user.id, filter: formal } }]);
  expect(saves).toEqual([]);

  await page.getByRole("button", { name: "保存条件" }).click({ timeout: 12_000 });
  await expect(page.getByText("准入条件已保存")).toBeVisible({ timeout: 12_000 });
  expect(saves).toEqual([{ clientCode: "expense", data: { filter: formal } }]);

  await page.getByRole("tab", { name: "基础信息" }).click({ timeout: 12_000 });
  await page.getByRole("tab", { name: "应用准入" }).click({ timeout: 12_000 });
  await expect(page.getByText(UserType.Formal, { exact: true })).toBeVisible({ timeout: 12_000 });
  await page.getByLabel("用户类型", { exact: true }).click({ timeout: 12_000 });
  await page.getByTitle(UserType.External, { exact: true }).click({ timeout: 12_000 });
  await page.getByRole("combobox", { name: "试算用户" }).fill(user.username, { timeout: 12_000 });
  await page.getByTitle(`${user.name} (${user.username})`, { exact: true }).click({ timeout: 12_000 });
  await page.getByRole("button", { name: /^试\s*算$/ }).click({ timeout: 12_000 });
  await expect(page.getByRole("status")).toHaveText("不匹配", { timeout: 12_000 });
  expect(previews).toHaveLength(2);
  expect(previews[1]).toEqual({ clientCode: "expense", data: { userId: user.id, filter: external } });

  documentAvailable = false;
  await page.getByRole("button", { name: /^试\s*算$/ }).click({ timeout: 12_000 });
  await expect(page.getByRole("status")).toHaveText("暂时无法判断", { timeout: 12_000 });
  expect(saves).toHaveLength(1);
});

test("an administrator saves and reopens conditions scoped to one employment", async ({ page }) => {
  page.setDefaultTimeout(12_000);
  await mockAdminApi(page, {
    clientDetail: { ...adminClientDetail, clientCode: "expense", clientName: "报销" },
  });
  const saves: unknown[] = [];
  let filter: unknown = null;
  await page.route("**/rpc/admin.clientAdmission.detail**", (route) =>
    fulfillTrpc(route, { enabled: false, filter, allowedActions }),
  );
  await page.route("**/rpc/admin.clientAdmission.save**", (route) => {
    const input = parseTrpcBatchInput<{ clientCode: string; data: { filter: unknown } }>(route);
    saves.push(input);
    filter = input.data.filter;
    return fulfillTrpc(route, { changed: true, result: { enabled: false, filter } });
  });

  await page.goto("/iam-admin/clients/expense/edit?section=basic");
  await page.getByRole("tab", { name: "应用准入" }).click();
  await page.getByLabel("条件类型", { exact: true }).click();
  await page.getByTitle("存在满足条件的有效任职", { exact: true }).click();
  await page.getByLabel("条件类型", { exact: true }).last().click();
  await page.getByTitle("全部满足", { exact: true }).last().click();
  await page.getByLabel("字段", { exact: true }).click();
  await page.getByTitle("岗位名称", { exact: true }).click();
  await page.getByLabel("条件值", { exact: true }).fill("审批员");
  await page.getByRole("button", { name: "添加子条件" }).click();
  await page.getByLabel("条件值", { exact: true }).last().click();
  await page.getByTitle("是", { exact: true }).click();
  await page.getByRole("button", { name: "保存条件" }).click();
  await expect(page.getByText("准入条件已保存")).toBeVisible();
  expect(saves).toEqual([
    {
      clientCode: "expense",
      data: {
        filter: {
          exists: {
            path: "employments",
            where: {
              and: [
                { field: "position.name", op: "eq", value: "审批员" },
                { field: "isPrimary", op: "eq", value: true },
              ],
            },
          },
        },
      },
    },
  ]);

  await page.getByRole("tab", { name: "基础信息" }).click();
  await page.getByRole("tab", { name: "应用准入" }).click();
  await expect(page.getByText("存在满足条件的有效任职", { exact: true })).toBeVisible();
  await expect(page.getByText("全部满足", { exact: true })).toBeVisible();
  await expect(page.getByLabel("条件值", { exact: true }).first()).toHaveValue("审批员");
  await expect(page.getByText("是", { exact: true })).toBeVisible();
});

test("an administrator can inspect null semantics and keep old codes in a saved condition", async ({ page }) => {
  page.setDefaultTimeout(12_000);
  await mockAdminApi(page, {
    clientDetail: { ...adminClientDetail, clientCode: "expense", clientName: "报销" },
  });
  const filter = {
    or: [
      { not: { field: "mobile", op: "in", value: ["13000000001", "13000000002"] } },
      {
        not: {
          exists: {
            path: "employments",
            where: {
              and: [
                { exists: { path: "organization.path", where: { field: "code", op: "eq", value: "FIN-OLD" } } },
                { field: "position.code", op: "eq", value: "APPROVER-OLD" },
                { field: "roles", op: "containsAny", value: ["expense:old"] },
              ],
            },
          },
        },
      },
    ],
  };
  await page.route("**/rpc/admin.clientAdmission.detail**", (route) =>
    fulfillTrpc(route, { enabled: false, filter, allowedActions }),
  );
  const missingCodes = new Map([
    ["admin.organization.detail", ApiErrorCode.OrganizationNotFound],
    ["admin.position.detail", ApiErrorCode.PositionNotFound],
    ["admin.role.detail", ApiErrorCode.RoleNotFound],
  ]);
  await page.route(/\/rpc\/admin\.(organization|position|role)\.detail/, (route) => {
    const operations = new URL(route.request().url()).pathname.split("/").at(-1)?.split(",") ?? [];
    return fulfillJson(
      route,
      operations.map((operation) => ({
        error: {
          message: "Not found",
          code: -32004,
          data: { code: "NOT_FOUND", httpStatus: 404, path: operation, serviceCode: missingCodes.get(operation) },
        },
      })),
    );
  });
  const saves: unknown[] = [];
  await page.route("**/rpc/admin.clientAdmission.save**", (route) => {
    const input = parseTrpcBatchInput<{ data: { filter: unknown } }>(route);
    saves.push(input.data.filter);
    return fulfillTrpc(route, { changed: true, result: { enabled: false, filter: input.data.filter } });
  });

  await page.goto("/iam-admin/clients/expense/edit?section=basic");
  await page.getByRole("tab", { name: "应用准入" }).click();
  await expect(page.getByText("手机号未填写时比较结果为假，外层排除后可为真。")).toBeVisible();
  await expect(page.getByText(/没有有效任职时，本条件为假，外层排除后可为真/)).toBeVisible();
  await expect(page.getByText(/包含该组织自身及其后代/)).toBeVisible();
  await expect(page.getByText(/找不到组织编码「FIN-OLD」/)).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText(/找不到岗位编码「APPROVER-OLD」/)).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText(/找不到角色编码「expense:old」/)).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("button", { name: "保存条件" })).toBeDisabled();
  await page.getByRole("textbox", { name: "条件值" }).nth(1).fill("13000000003");
  await page.getByRole("button", { name: "保存条件" }).click();
  await expect(page.getByText("准入条件已保存")).toBeVisible();
  expect(saves).toEqual([
    { or: [{ not: { field: "mobile", op: "in", value: ["13000000001", "13000000003"] } }, filter.or[1]] },
  ]);
});
