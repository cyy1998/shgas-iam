import type { RoleDetailVo, RoleSearchParams } from "@admin/services/role";
import { ClientStatus, RoleKind, RoleStatus, RoleType } from "@iam/contracts";
import { expect, it } from "vitest";
import { mockAdminRpc, mockCurrentAdminUser, rpcFailure } from "~admin/test/mocks/rpc";
import { server } from "~admin/test/mocks/server";
import { fireEvent, screen, waitFor, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();
const path = "/iam-admin/roles";
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
const composite: RoleDetailVo = {
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

function fill(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

it("filters the drawer's assignments by target type, keyword and scope and resets them together", async () => {
  const rpc = mockAdminRpc({
    "admin.role.search": () => ({ result: [composite], total: 1 }),
    "admin.role.detail": () => composite,
    "admin.role.assignments.search": () => ({ result: [], total: 0 }),
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const { user } = renderAdminApp(path);
  await user.click(await screen.findByRole("button", { name: "编辑" }));
  const panel = within(await screen.findByRole("region", { name: "分配对象" }));
  await user.click(panel.getByRole("combobox", { name: "类型" }));
  await user.click(await screen.findByTitle("组织", { exact: true }));
  const text = panel.getByRole("textbox", { name: "对象" });
  fill(text, "总部");
  await user.click(panel.getByRole("combobox", { name: "作用范围" }));
  await user.click(await screen.findByTitle("含下级组织", { exact: true }));
  await user.click(panel.getByRole("button", { name: /查\s*询/ }));
  const lastSearch = () =>
    rpc.requests.filter(({ procedure }) => procedure === "admin.role.assignments.search").at(-1)?.input;
  await waitFor(() =>
    expect(lastSearch()).toEqual({
      roleCode: composite.roleCode,
      query: {
        pageNum: 1,
        pageSize: 10,
        conditions: {
          fuzzyConditions: { text: "总部" },
          exactConditions: { targetType: "organization", includeDescendants: true },
        },
      },
    }),
  );
  await user.click(panel.getByRole("button", { name: /重\s*置/ }));
  await waitFor(() =>
    expect(lastSearch()).toEqual({
      roleCode: composite.roleCode,
      query: { pageNum: 1, pageSize: 10, conditions: { fuzzyConditions: {}, exactConditions: {} } },
    }),
  );
  expect(panel.getByRole("textbox", { name: "对象" })).toHaveValue("");
});

it("corrects a rejected Global Composite Role creation without losing form choices", async () => {
  let role: RoleDetailVo | undefined;
  let tries = 0;
  const rpc = mockAdminRpc({
    "admin.client.search": () => ({ result: [], total: 0 }),
    "admin.role.search": () => ({ result: role ? [role] : [], total: role ? 1 : 0 }),
    "admin.role.detail": () => role,
    "admin.role.assignments.search": () => ({ result: [], total: 0 }),
    "admin.role.create": (input) => {
      if (++tries === 1) return rpcFailure(409, undefined, "角色编码已存在");
      role = { ...composite, roleCode: input.roleCode, roleName: input.roleName };
      return { changed: true, result: role };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const { user } = renderAdminApp(path);
  await user.click(await screen.findByRole("button", { name: /新建角色/ }));
  const form = within(await screen.findByRole("dialog"));
  await user.click(await form.findByRole("combobox", { name: "角色形态" }));
  await user.click(await screen.findByTitle("组合角色", { exact: true }));
  await user.click(form.getByRole("combobox", { name: "角色归属" }));
  await user.click(await screen.findByTitle("全局角色", { exact: true }));
  const code = form.getByRole("textbox", { name: "角色编码" });
  fill(code, "reviewer");
  fill(form.getByRole("textbox", { name: "角色名称" }), "审核职责");
  const submit = form.getByRole("button", { name: /确\s*定/ });
  await user.click(submit);
  expect(await screen.findByText("角色编码已存在")).toBeVisible();
  expect(form.queryByRole("combobox", { name: "所属应用" })).not.toBeInTheDocument();
  expect(form.getByRole("textbox", { name: "角色名称" })).toHaveValue("审核职责");
  fill(code, "review-duty");
  await user.click(submit);
  await screen.findByRole("row", { name: /global:review-duty.*详情/ });
  const detail = within(await screen.findByRole("region", { name: "基本信息" }));
  expect(detail.getByText("组合角色", { exact: true })).toBeVisible();
  expect(detail.getByText("全局角色", { exact: true })).toBeVisible();
  const writes = rpc.collectMutationRequests().map(({ input }) => input);
  expect(writes).toMatchObject([
    { roleCode: "global:reviewer", roleKind: "composite", roleType: "global" },
    { roleCode: "global:review-duty", roleKind: "composite", roleType: "global" },
  ]);
  expect(writes[1]).not.toHaveProperty("clientCode");
});

it("adds a member from page two, retains the rejected cycle draft, then shows the reverse relation and removes it", {
  timeout: 15_000,
}, async () => {
  const container = { ...composite };
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
  const earlier = Array.from({ length: 30 }, (_, index) => ({
    ...member,
    id: index + 2,
    roleCode: `portal:review-step-${index + 1}`,
    roleName: `工单审核 ${index + 1}`,
  }));
  const queries: RoleSearchParams[] = [];
  let patches = 0;
  const rpc = mockAdminRpc({
    "admin.client.search": () => ({ result: [client], total: 1 }),
    "admin.role.search": (query) => {
      queries.push(query);
      const { exactConditions, fuzzyConditions } = query.conditions;
      const text = fuzzyConditions.text ?? "";
      const roles =
        exactConditions.clientCode || text ? [container, ...earlier, member] : [container, member, ...earlier];
      const matches = roles.filter(
        (role) =>
          (!exactConditions.clientCode || role.client?.clientCode === exactConditions.clientCode) &&
          (role.roleCode.includes(text) || role.roleName.includes(text)),
      );
      const { pageNum = 1, pageSize = 10 } = query;
      return {
        result: matches.slice((pageNum - 1) * pageSize, pageNum * pageSize),
        total: matches.length,
        pageNum,
        pageSize,
        pages: Math.ceil(matches.length / pageSize),
      };
    },
    "admin.role.detail": ({ roleCode }) => (roleCode === container.roleCode ? container : member),
    "admin.role.assignments.search": () => ({ result: [], total: 0 }),
    "admin.role.update": ({ data }) => {
      if (++patches === 1) return rpcFailure(400, undefined, "角色包含关系不能形成循环");
      const add = data.inclusions?.addRoleIds.includes(member.id);
      container.members = add ? [{ ...member }] : [];
      member.containers = add ? [{ ...container }] : [];
      return { changed: true, result: null };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  let app = renderAdminApp(path);
  const { user } = app;
  const editContainer = async () =>
    app.user.click(
      within(await screen.findByRole("row", { name: /global:work.*详情/ })).getByRole("button", { name: "编辑" }),
    );
  await editContainer();
  const drawer = within(await screen.findByRole("dialog"));
  const direct = within(await drawer.findByRole("region", { name: "直接成员" }));
  await user.click(direct.getByRole("combobox", { name: "筛选成员应用" }));
  await user.click(
    (await screen.findAllByText("门户应用（portal）", { exact: true })).at(-1) ??
      screen.getByRole("option", { name: /门户应用/ }),
  );
  await user.type(direct.getByRole("combobox", { name: "添加直接成员" }), "工单审核");
  const next = await direct.findByRole("button", { name: "成员结果下一页" });
  await waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
  const options = await screen.findAllByText(/portal:reviewer.*门户应用.*暂停/);
  await user.click(options[options.length - 1]);
  expect(queries).toContainEqual(
    expect.objectContaining({
      pageNum: 2,
      conditions: { exactConditions: { clientCode: "portal" }, fuzzyConditions: { text: "工单审核" } },
    }),
  );
  expect(direct.getByText(/启用后/)).toBeInTheDocument();
  const save = () => user.click(drawer.getByRole("button", { name: /保\s*存/ }));
  await save();
  expect(await screen.findByText("角色包含关系不能形成循环")).toBeVisible();
  expect(direct.getByRole("button", { name: /移除.*工单审核/ })).toBeVisible();
  await save();
  await waitFor(() => expect(direct.queryByRole("combobox", { name: "添加直接成员" })).not.toBeInTheDocument());
  const persisted = within(await drawer.findByRole("region", { name: "直接成员" }));
  expect(await persisted.findByText("工单审核", { exact: true })).toBeVisible();

  app.unmount();
  app = renderAdminApp(path);
  const memberRow = within(await screen.findByRole("row", { name: /portal:reviewer.*详情/ }));
  await app.user.click(memberRow.getByRole("button", { name: "详情" }));
  expect(within(await screen.findByRole("region", { name: "直接包含方" })).getByText(container.roleName)).toBeVisible();

  app.unmount();
  app = renderAdminApp(path);
  await editContainer();
  const reopened = within(await screen.findByRole("region", { name: "直接成员" }));
  await app.user.click(reopened.getByRole("button", { name: /移除.*工单审核/ }));
  await app.user.click(screen.getByRole("button", { name: /保\s*存/ }));
  await waitFor(() => expect(rpc.collectMutationRequests()).toHaveLength(3));
  expect(rpc.collectMutationRequests().map(({ input }) => input)).toMatchObject([
    { data: { inclusions: { addRoleIds: [member.id], removeRoleIds: [] } } },
    { data: { inclusions: { addRoleIds: [member.id], removeRoleIds: [] } } },
    { data: { inclusions: { addRoleIds: [], removeRoleIds: [member.id] } } },
  ]);
});
