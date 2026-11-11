// Browser Integration uses a mocked backend; this is not a full-system journey.
import type { RoleCreateInput, RoleDetailVo, RoleSearchParams, RoleUpdateInput } from "@admin/services/role";
import { ClientStatus, RoleKind, RoleStatus, RoleType } from "@iam/contracts";
import { expect, test } from "@playwright/test";
import { fulfillJson, fulfillTrpc, mockAdminApi, parseTrpcBatchInput } from "../fixtures";

test("edits a role inline alongside its assignments and preserves drafts across scoped logs", async ({ page }) => {
  await mockAdminApi(page);
  let role: RoleDetailVo = {
    id: 1,
    roleCode: "reader",
    roleName: "阅读角色",
    description: "原角色描述",
    status: RoleStatus.Enable,
    statusText: "正常",
    roleKind: RoleKind.Basic,
    roleType: RoleType.Client,
    clientId: 1,
    isDelete: false,
    client: { id: 1, clientCode: "iam-admin", clientName: "管理端", status: ClientStatus.Enable },
    assignmentCount: 1,
    members: [],
    containers: [],
    createTime: "2026-01-01T00:00:00Z",
    updateTime: "2026-01-01T00:00:00Z",
  };
  const assignment = {
    id: 10,
    roleId: 1,
    targetId: 3,
    targetType: "organization",
    targetTypeText: "组织",
    target: { id: 3, name: "总部", code: "ROOT", status: 1, description: null },
    includeDescendants: true,
    scopeText: "含下级组织",
    createTime: "2026-01-01T00:00:00Z",
  };
  const auditSearches: unknown[] = [];
  const assignmentSearches: unknown[] = [];
  const responses: Record<string, () => unknown> = {
    "admin.client.search": () => ({ result: [role.client], total: 1 }),
    "admin.role.search": () => ({ result: [role], total: 1 }),
    "admin.role.detail": () => role,
    "admin.role.assignments.search": () => ({ result: [assignment], total: 1 }),
    "admin.audit.search": () => ({ result: [], total: 0 }),
  };
  await page.route("**/rpc/**", (route) => {
    const url = new URL(route.request().url());
    const procedures = url.pathname.split("/rpc/")[1]?.split(",") ?? [];
    if (!procedures.every((procedure) => procedure in responses)) return route.fallback();
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}") as Record<string, unknown>;
    return fulfillJson(
      route,
      procedures.map((procedure, index) => {
        if (procedure === "admin.audit.search") auditSearches.push(inputs[String(index)]);
        if (procedure === "admin.role.assignments.search") assignmentSearches.push(inputs[String(index)]);
        return { result: { data: responses[procedure]() } };
      }),
    );
  });
  type UpdateInput = { roleCode: string; data: RoleUpdateInput };
  const updates: UpdateInput[] = [];
  await page.route("**/rpc/admin.role.update**", (route) => {
    const input = parseTrpcBatchInput<UpdateInput>(route);
    updates.push(input);
    role = { ...role, ...input.data };
    return fulfillTrpc(route, { changed: true, result: null });
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/iam-admin/roles");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const drawer = page.getByRole("dialog");
  const basic = drawer.getByRole("region", { name: "基本信息" });
  const assignments = drawer.getByRole("region", { name: "分配对象" });
  const name = basic.getByRole("textbox", { name: "角色名称" });
  await expect(name).toHaveValue("阅读角色");
  await expect(assignments.getByRole("cell", { name: /总部/ })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(basic.getByRole("textbox", { name: "角色编码" })).toHaveCount(0);
  await expect(basic.getByRole("combobox", { name: "所属应用" })).toHaveCount(0);

  await assignments.getByRole("combobox", { name: "类型" }).click();
  await page.getByTitle("组织", { exact: true }).click();
  await assignments.getByRole("textbox", { name: "对象" }).fill("总部");
  await assignments.getByRole("combobox", { name: "作用范围" }).click();
  await page.getByTitle("含下级组织", { exact: true }).click();
  await assignments.getByRole("button", { name: /查\s*询/ }).click();
  await expect
    .poll(() => assignmentSearches.at(-1))
    .toEqual({
      roleCode: "reader",
      query: {
        pageNum: 1,
        pageSize: 10,
        conditions: {
          fuzzyConditions: { text: "总部" },
          exactConditions: { targetType: "organization", includeDescendants: true },
        },
      },
    });
  await assignments.getByRole("button", { name: /重\s*置/ }).click();
  await expect
    .poll(() => assignmentSearches.at(-1))
    .toEqual({
      roleCode: "reader",
      query: { pageNum: 1, pageSize: 10, conditions: { fuzzyConditions: {}, exactConditions: {} } },
    });
  await expect(assignments.getByRole("textbox", { name: "对象" })).toHaveValue("");

  await name.fill("未保存草稿");
  await drawer.getByRole("tab", { name: "操作日志" }).click();
  await expect
    .poll(() => auditSearches)
    .toEqual([{ pageNum: 1, pageSize: 10, conditions: { targetType: "role", targetCode: "reader" } }]);
  await drawer.getByRole("tab", { name: "角色信息" }).click();
  await expect(name).toHaveValue("未保存草稿");
  await basic.getByRole("button", { name: /取\s*消/ }).click();
  await basic.getByRole("button", { name: /编\s*辑/ }).click();
  await expect(name).toHaveValue("阅读角色");
  expect(updates).toEqual([]);

  await name.fill("  阅读管理员  ");
  await basic.getByRole("textbox", { name: "描述" }).fill("");
  await basic.getByRole("button", { name: /保\s*存/ }).click();
  await expect(name).toHaveCount(0);
  await expect(basic.getByText("阅读管理员", { exact: true })).toBeVisible();
  await expect(assignments.getByRole("cell", { name: /总部/ })).toBeVisible();
  expect(updates).toEqual([{ roleCode: "reader", data: { roleName: "阅读管理员", description: null } }]);

  await page.setViewportSize({ width: 430, height: 932 });
  await basic.getByRole("button", { name: /编\s*辑/ }).click();
  await expect(name).toHaveValue("阅读管理员");
  await basic.getByRole("textbox", { name: "描述" }).fill("取消的修改");
  await basic.getByRole("button", { name: /取\s*消/ }).click();
  expect(updates).toHaveLength(1);
});

test("creates an empty Global Composite Role after correcting a rejected creation", async ({ page }) => {
  await mockAdminApi(page);
  let role: RoleDetailVo | undefined;
  const responses: Record<string, () => unknown> = {
    "admin.client.search": () => ({ result: [], total: 0 }),
    "admin.role.search": () => ({ result: role ? [role] : [], total: role ? 1 : 0 }),
    "admin.role.detail": () => role,
    "admin.role.assignments.search": () => ({ result: [], total: 0 }),
  };
  await page.route("**/rpc/**", (route) => {
    const procedures = new URL(route.request().url()).pathname.split("/rpc/")[1]?.split(",") ?? [];
    if (!procedures.every((procedure) => procedure in responses)) return route.fallback();
    return fulfillJson(
      route,
      procedures.map((procedure) => ({ result: { data: responses[procedure]() } })),
    );
  });
  const creations: RoleCreateInput[] = [];
  await page.route("**/rpc/admin.role.create**", (route) => {
    const input = parseTrpcBatchInput<RoleCreateInput>(route);
    creations.push(input);
    if (creations.length === 1) {
      return fulfillJson(route, [
        {
          error: {
            message: "角色编码已存在",
            code: -32009,
            data: { code: "CONFLICT", httpStatus: 409, path: "admin.role.create" },
          },
        },
      ]);
    }
    role = {
      id: 1,
      roleCode: input.roleCode,
      roleName: input.roleName,
      roleKind: input.roleKind ?? RoleKind.Basic,
      roleType: input.roleType ?? RoleType.Client,
      description: input.description ?? null,
      status: RoleStatus.Enable,
      statusText: "正常",
      client: null,
      clientId: null,
      isDelete: false,
      assignmentCount: 0,
      members: [],
      containers: [],
      createTime: "2026-01-01T00:00:00Z",
      updateTime: "2026-01-01T00:00:00Z",
    };
    return fulfillTrpc(route, { changed: true, result: role });
  });

  await page.goto("/iam-admin/roles");
  await page.getByRole("button", { name: "新建角色" }).click();
  const form = page.getByRole("dialog", { name: "新建角色" });
  await form.getByRole("combobox", { name: "角色形态" }).click();
  await page.getByTitle("组合角色", { exact: true }).click();
  await form.getByRole("combobox", { name: "角色归属" }).click();
  await page.getByTitle("全局角色", { exact: true }).click();
  await expect(form.getByRole("combobox", { name: "所属应用" })).toHaveCount(0);
  await form.getByRole("textbox", { name: "角色编码" }).fill("reviewer");
  await form.getByRole("textbox", { name: "角色名称" }).fill("审核职责");

  const submit = form.getByRole("button", { name: /确\s*定/ });
  await submit.click();
  await expect(page.getByText("角色编码已存在")).toBeVisible();
  await expect(form.getByText("组合角色", { exact: true })).toBeVisible();
  await expect(form.getByText("全局角色", { exact: true })).toBeVisible();
  await expect(form.getByRole("textbox", { name: "角色名称" })).toHaveValue("审核职责");

  await form.getByRole("textbox", { name: "角色编码" }).fill("review-duty");
  await submit.click();
  await expect(form).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "global:review-duty" });
  await expect(row.getByRole("cell", { name: "组合角色" })).toBeVisible();
  await expect(row.getByRole("cell", { name: "全局角色" })).toBeVisible();
  const basic = page.getByRole("dialog").getByRole("region", { name: "基本信息" });
  await expect(basic.getByText("组合角色", { exact: true })).toBeVisible();
  await expect(basic.getByText("全局角色", { exact: true })).toBeVisible();
  expect(creations).toMatchObject([
    { roleCode: "global:reviewer", roleKind: "composite", roleType: "global" },
    { roleCode: "global:review-duty", roleKind: "composite", roleType: "global" },
  ]);
  expect(creations[1]).not.toHaveProperty("clientCode");
});

test("saves a direct member from a later search page and keeps the draft after a server rejection", async ({
  page,
}) => {
  await mockAdminApi(page);
  const client = { id: 1, clientCode: "portal", clientName: "门户应用", status: ClientStatus.Enable };
  const base = {
    description: null,
    assignmentCount: 0,
    isDelete: false,
    members: [],
    containers: [],
    createTime: "2026-01-01T00:00:00Z",
    updateTime: "2026-01-01T00:00:00Z",
  };
  const member: RoleDetailVo = {
    ...base,
    id: 32,
    roleCode: "portal:reviewer",
    roleName: "工单审核",
    roleType: RoleType.Client,
    roleKind: RoleKind.Basic,
    client,
    clientId: client.id,
    status: RoleStatus.Pause,
    statusText: "暂停",
  };
  const container: RoleDetailVo = {
    ...base,
    id: 1,
    roleCode: "global:work",
    roleName: "工单职责",
    roleType: RoleType.Global,
    roleKind: RoleKind.Composite,
    client: null,
    clientId: null,
    status: RoleStatus.Enable,
    statusText: "正常",
  };
  const earlierMatches = Array.from({ length: 30 }, (_, index) => ({
    ...member,
    id: index + 2,
    roleCode: `portal:review-step-${index + 1}`,
    roleName: `工单审核 ${index + 1}`,
  }));
  const endpoint = ({ id, roleCode, roleName, roleType, status, client }: RoleDetailVo) => ({
    id,
    roleCode,
    roleName,
    roleType,
    status,
    client,
  });
  const queries: RoleSearchParams[] = [];
  const patches: RoleUpdateInput[] = [];
  await page.route("**/rpc/**", (route) => {
    const url = new URL(route.request().url());
    const procedures = url.pathname.split("/rpc/")[1]?.split(",") ?? [];
    const reads = ["admin.client.search", "admin.role.search", "admin.role.detail", "admin.role.assignments.search"];
    if (!procedures.every((procedure) => reads.includes(procedure))) return route.fallback();
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}") as Record<string, unknown>;
    return fulfillJson(
      route,
      procedures.map((procedure, index) => {
        const input = inputs[String(index)];
        let data: unknown;
        if (procedure === "admin.role.search") {
          const query = input as RoleSearchParams;
          queries.push(query);
          const { exactConditions, fuzzyConditions } = query.conditions;
          const matches = [container, ...earlierMatches, member].filter(
            (role) =>
              (!exactConditions.clientCode || role.client?.clientCode === exactConditions.clientCode) &&
              (!fuzzyConditions.text ||
                role.roleCode.includes(fuzzyConditions.text) ||
                role.roleName.includes(fuzzyConditions.text)),
          );
          const { pageNum = 1, pageSize = 10 } = query;
          const offset = (pageNum - 1) * pageSize;
          data = {
            result: matches.slice(offset, offset + pageSize),
            total: matches.length,
            pageNum,
            pageSize,
            pages: Math.ceil(matches.length / pageSize),
          };
        } else if (procedure === "admin.role.detail") {
          data = (input as { roleCode: string }).roleCode === container.roleCode ? container : member;
        } else {
          const result = procedure === "admin.client.search" ? [client] : [];
          data = { result, total: result.length };
        }
        return { result: { data } };
      }),
    );
  });
  await page.route("**/rpc/admin.role.update**", (route) => {
    const { data } = parseTrpcBatchInput<{ data: RoleUpdateInput }>(route);
    patches.push(data);
    if (patches.length === 1) {
      return fulfillJson(route, [
        {
          error: {
            message: "角色包含关系不能形成循环",
            code: -32600,
            data: { code: "BAD_REQUEST", httpStatus: 400, path: "admin.role.update" },
          },
        },
      ]);
    }
    container.members = data.inclusions?.addRoleIds.includes(member.id) ? [endpoint(member)] : [];
    member.containers = container.members.length ? [endpoint(container)] : [];
    return fulfillTrpc(route, { changed: true, result: null });
  });

  await page.goto("/iam-admin/roles");
  const containerRow = page.getByRole("row").filter({ hasText: container.roleCode });
  await containerRow.getByRole("button", { name: "编辑", exact: true }).click();
  const drawer = page.getByRole("dialog");
  const directMembers = drawer.getByRole("region", { name: "直接成员" });
  const clientFilter = directMembers.getByRole("combobox", { name: "筛选成员应用" });
  await clientFilter.click();
  await page.getByText("门户应用（portal）", { exact: true }).last().click();
  const picker = directMembers.getByRole("combobox", { name: "添加直接成员" });
  await picker.fill("工单审核");
  await expect(page.getByText(/portal:review-step-1）/).last()).toBeVisible();
  const nextPage = directMembers.getByRole("button", { name: "成员结果下一页" });
  await expect(nextPage).toBeEnabled({ timeout: 10_000 });
  await nextPage.click();
  await page
    .getByText(/portal:reviewer.*门户应用.*暂停/)
    .last()
    .click({ timeout: 10_000 });
  expect(queries).toContainEqual(
    expect.objectContaining({
      pageNum: 2,
      conditions: { exactConditions: { clientCode: "portal" }, fuzzyConditions: { text: "工单审核" } },
    }),
  );
  await expect(directMembers.getByText(/启用后/)).toBeVisible();
  const save = drawer.getByRole("button", { name: /保\s*存/ });
  await save.click();
  await expect(page.getByText("角色包含关系不能形成循环")).toBeVisible();
  await expect(directMembers.getByRole("button", { name: /移除.*工单审核/ })).toBeVisible();
  await save.click();
  await expect(directMembers.getByRole("combobox", { name: "添加直接成员" })).toHaveCount(0);
  await expect(directMembers.getByText("工单审核", { exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "关闭" }).click();
  const roleSearch = page.getByRole("searchbox", { name: "搜索角色" });
  await roleSearch.fill(member.roleCode, { timeout: 10_000 });
  await roleSearch.press("Enter");
  const memberRow = page.getByRole("row").filter({ hasText: member.roleCode });
  await memberRow.getByRole("button", { name: "详情", exact: true }).click();
  await expect(drawer.getByRole("region", { name: "直接包含方" }).getByText(container.roleName)).toBeVisible();
  await drawer.getByRole("button", { name: "关闭" }).click();
  await roleSearch.fill("");
  await containerRow.getByRole("button", { name: "编辑", exact: true }).click();
  await directMembers.getByRole("button", { name: /移除.*工单审核/ }).click();
  await save.click();
  await expect(directMembers.getByText("工单审核", { exact: true })).toHaveCount(0);
  expect(patches.map(({ inclusions }) => inclusions)).toEqual([
    { addRoleIds: [member.id], removeRoleIds: [] },
    { addRoleIds: [member.id], removeRoleIds: [] },
    { addRoleIds: [], removeRoleIds: [member.id] },
  ]);
});
