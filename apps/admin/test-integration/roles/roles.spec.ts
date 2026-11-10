// Browser Integration uses a mocked backend; this is not a full-system journey.
import type { RoleDetailVo, RoleUpdateInput } from "@admin/services/role";
import { ClientStatus, RoleStatus, RoleType } from "@iam/contracts";
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
    roleType: RoleType.Client,
    clientId: 1,
    isDelete: false,
    client: { id: 1, clientCode: "iam-admin", clientName: "管理端", status: ClientStatus.Enable },
    assignmentCount: 1,
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
