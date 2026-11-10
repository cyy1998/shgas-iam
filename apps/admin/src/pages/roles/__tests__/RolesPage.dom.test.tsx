import RolesPage from "@admin/pages/roles";
import type { RoleDetailVo, RoleSearchParams } from "@admin/services/role";
import { ApiErrorCode, ClientStatus, RoleAssignmentTargetType, RoleType } from "@iam/contracts";
import { ConfigProvider, Modal, message } from "antd";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "~admin/test/mocks/server";
import { cleanup, render, screen, waitFor, within } from "~admin/test/render";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();

vi.mock("@admin/constants/config", () => ({
  API_PREFIX: "http://localhost",
  SSO_CLIENT_CODE: "iam-admin",
}));

// jsdom does not finish CSS transitions; retain the real form and table behavior.
vi.mock("@admin/components/OrganizationTreeSelector", () => ({
  default: ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <input aria-label="选择组织" value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} />
  ),
}));
vi.mock("@ant-design/pro-components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ant-design/pro-components")>();
  const ModalForm = (props: ComponentProps<typeof actual.ModalForm>) => (
    <actual.ModalForm
      {...props}
      modalProps={{
        ...props.modalProps,
        transitionName: "",
        maskTransitionName: "",
      }}
    />
  );
  return { ...actual, ModalForm, default: { ...actual, ModalForm } };
});

ConfigProvider.config({
  holderRender: (children) => <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>,
});

const role: RoleDetailVo = {
  id: 1,
  roleCode: "reader",
  roleName: "阅读角色",
  description: null,
  status: 1,
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
  targetType: "organization",
  targetTypeText: "组织",
  target: { name: "总部", code: "ROOT" },
  includeDescendants: false,
  scopeText: "仅当前对象",
  createTime: "2026-01-01T00:00:00Z",
};
const reads = { detail: vi.fn(), search: vi.fn(), assignments: vi.fn() };
beforeEach(() => {
  Object.values(reads).forEach((read) => {
    read.mockReset();
  });
  server.use(
    http.get("*/rpc/:procedures", ({ params, request }) => {
      const inputs = JSON.parse(new URL(request.url).searchParams.get("input") ?? "{}");
      return HttpResponse.json(
        String(params.procedures)
          .split(",")
          .map((procedure, index) => {
            if (procedure === "admin.client.search")
              return {
                result: {
                  data: {
                    result: [{ clientCode: "iam-admin", clientName: "管理端" }],
                    total: 1,
                  },
                },
              };
            if (procedure === "admin.role.detail") {
              return { result: { data: reads.detail(inputs[index]) ?? role } };
            }
            if (procedure === "admin.role.search") {
              const result = reads.search(inputs[index]) ?? [role];
              return { result: { data: { result, total: result.length } } };
            }
            if (procedure === "admin.role.assignments.search") {
              reads.assignments();
              return { result: { data: { result: [assignment], total: 1 } } };
            }
            return { result: { data: { result: [], total: 0 } } };
          }),
      );
    }),
  );
});
afterEach(async () => {
  cleanup();
  message.destroy();
  Modal.destroyAll();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
function mutation(procedure: string, changed = true, status?: number, committed = false) {
  const requests: unknown[] = [];
  server.use(
    http.post(`*/rpc/admin.role.${procedure}`, async ({ request }) => {
      requests.push(await request.json());
      return status
        ? HttpResponse.json(
            [
              {
                error: {
                  message: "角色写入失败",
                  code: -32603,
                  data: {
                    httpStatus: status,
                    ...(committed ? { serviceCode: ApiErrorCode.AdminMutationCommitted } : {}),
                  },
                },
              },
            ],
            { status },
          )
        : HttpResponse.json([
            {
              result: {
                data: { changed, result: procedure === "create" ? role : null },
              },
            },
          ]);
    }),
  );
  return requests;
}
async function page() {
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RolesPage />
    </ConfigProvider>,
  );
  await screen.findByText(role.roleName);
  return view;
}
async function assignments() {
  const view = await page();
  await view.user.click(screen.getByRole("button", { name: "详情" }));
  await screen.findByText("总部");
  return view;
}
async function editRole() {
  const view = await page();
  await view.user.click(screen.getByRole("button", { name: "编辑" }));
  await screen.findByRole("textbox", { name: "角色名称" });
  return view;
}

function profile() {
  return within(screen.getByRole("region", { name: "基本信息" }));
}

it("lists Global Roles with no Client and filters by Role type", async () => {
  const globalRole: RoleDetailVo = {
    ...role,
    id: 2,
    roleCode: "global:reviewer",
    roleName: "全局审核员",
    roleType: RoleType.Global,
    clientId: null,
    client: null,
  };
  reads.search.mockImplementation((query: RoleSearchParams) =>
    query.conditions.exactConditions.roleType === RoleType.Global ? [globalRole] : [role, globalRole],
  );
  reads.detail.mockImplementation(({ roleCode }: { roleCode: string }) =>
    roleCode === globalRole.roleCode ? globalRole : role,
  );
  const { user } = await page();
  const globalRow = await screen.findByRole("row", { name: /全局审核员/ });
  expect(within(globalRow).getByRole("cell", { name: "全局角色" })).toBeVisible();
  expect(within(globalRow).getByRole("cell", { name: "无" })).toBeVisible();

  await user.click(screen.getByRole("combobox", { name: "角色类型" }));
  await user.click(await screen.findByText("全局角色", { selector: ".ant-select-item-option-content" }));
  await waitFor(() => expect(screen.queryByText(role.roleName)).not.toBeInTheDocument());
  expect(reads.search).toHaveBeenLastCalledWith(
    expect.objectContaining({
      conditions: { fuzzyConditions: {}, exactConditions: { roleType: RoleType.Global } },
    }),
  );

  await user.click(within(screen.getByRole("row", { name: /全局审核员/ })).getByRole("button", { name: "详情" }));
  expect(await profile().findByText("全局角色")).toBeVisible();
  expect(profile().getByText("无")).toBeVisible();
});

describe("RolesPage mutation results through the role service", () => {
  it.each([
    { targetType: RoleAssignmentTargetType.Employment, status: 1, name: "张三 / 运营部 / 职员" },
    { targetType: RoleAssignmentTargetType.Organization, status: null, name: "已删除对象" },
  ])("omits internal target ids for $targetType with status $status", async ({ targetType, status, name }) => {
    server.use(
      http.get("*/rpc/admin.role.assignments.search", () =>
        HttpResponse.json([
          {
            result: {
              data: { result: [{ ...assignment, targetType, target: { id: 42, code: "42", name, status } }], total: 1 },
            },
          },
        ]),
      ),
    );
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: "详情" }));
    const panel = within(await screen.findByRole("region", { name: "分配对象" }));
    expect(await panel.findByText(name)).toBeVisible();
    expect(panel.queryByText("42")).not.toBeInTheDocument();
  });

  it("closes a committed assignment creation and retains the repair warning", async () => {
    const requests = mutation("assignments.create", false, 500, true);
    const { user } = await assignments();
    await user.click(screen.getByRole("button", { name: "新增分配" }));
    await user.type(screen.getByLabelText("选择组织"), "ROOT");
    const dialogs = await screen.findAllByRole("dialog");
    await user.click(
      within(dialogs[dialogs.length - 1]).getByRole("button", {
        name: "确 定",
      }),
    );
    await waitFor(() => expect(reads.detail.mock.calls.length).toBeGreaterThan(1));
    expect(await screen.findByText("操作已生效，但后续处理失败，请刷新确认并联系管理员修复")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText("选择组织")).not.toBeInTheDocument());
    expect(requests).toHaveLength(1);
  });

  it("opens the created resource from the unified result", async () => {
    const requests = mutation("create");
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: /新建角色/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByRole("textbox", { name: "角色编码" }), "reader");
    await user.type(dialog.getByRole("textbox", { name: "角色名称" }), "阅读角色");
    await user.click(dialog.getByRole("combobox", { name: "所属应用" }));
    await user.click(
      await screen.findByText("管理端（iam-admin）", {
        selector: ".ant-select-item-option-content",
      }),
    );
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("角色已创建")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "基本信息" })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(reads.detail).toHaveBeenCalled();
  });
  it("creates an assignment and refreshes the committed detail", async () => {
    const requests = mutation("assignments.create");
    const { user } = await assignments();
    await user.click(screen.getByRole("button", { name: "新增分配" }));
    await user.type(screen.getByLabelText("选择组织"), "ROOT");
    const dialogs = await screen.findAllByRole("dialog");
    await user.click(
      within(dialogs[dialogs.length - 1]).getByRole("button", {
        name: "确 定",
      }),
    );
    expect(await screen.findByText("分配已创建")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    await waitFor(() => expect(reads.detail.mock.calls.length).toBeGreaterThan(1));
  });

  it("completes an edit without stale status and refreshes the list", async () => {
    const requests = mutation("update");
    const { user } = await editRole();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const name = profile().getByRole("textbox", { name: "角色名称" });
    await user.clear(name);
    await user.type(name, "更新角色");
    const searchesBeforeSubmit = reads.search.mock.calls.length;
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("角色已更新")).toBeInTheDocument();
    expect(requests).toEqual([{ "0": { roleCode: "reader", data: { roleName: "更新角色" } } }]);
    await waitFor(() => expect(profile().queryByRole("textbox", { name: "角色名称" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("region", { name: "分配对象" })).toBeVisible();
    await waitFor(() => expect(reads.search.mock.calls.length).toBeGreaterThan(searchesBeforeSubmit));
  });

  it.each([true, false])("reports status changed=%s", async (changed) => {
    const requests = mutation("updateStatus", changed);
    const { user } = await page();
    await user.hover(screen.getByRole("button", { name: "状态" }));
    await user.click(await screen.findByText("切为「暂停」"));
    expect(await screen.findByText(changed ? "状态已更新" : "无需修改")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it("reports deletion", async () => {
    const requests = mutation("delete");
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "确 定",
      }),
    );
    expect(await screen.findByText("角色已删除")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it("rereads committed role details without replay and retains the warning", async () => {
    const requests = mutation("update", false, 500, true);
    const { user } = await editRole();
    await user.type(profile().getByRole("textbox", { name: "角色名称" }), "修订");
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    await waitFor(() => expect(reads.detail.mock.calls.length).toBeGreaterThan(1));
    expect(
      await within(screen.getByRole("dialog")).findByText("操作已生效，但后续处理失败，请刷新确认并联系管理员修复"),
    ).toBeVisible();
    expect(profile().queryByRole("textbox", { name: "角色名称" })).not.toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it.each([true, false])("reports assignment scope changed=%s", async (changed) => {
    const requests = mutation("assignments.updateScope", changed);
    const { user } = await assignments();
    await user.click(screen.getByRole("button", { name: "含下级" }));
    expect(await screen.findByText(changed ? "作用范围已更新" : "无需修改")).toBeInTheDocument();
    expect(requests).toEqual([
      {
        "0": {
          roleCode: "reader",
          assignmentId: 10,
          includeDescendants: true,
        },
      },
    ]);
  });
  it("refreshes an assignment committed failure without replay or losing its warning", async () => {
    const requests = mutation("assignments.updateScope", false, 500, true);
    const { user } = await assignments();
    await user.click(screen.getByRole("button", { name: "含下级" }));
    await waitFor(() => expect(reads.detail.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(reads.assignments.mock.calls.length).toBeGreaterThan(1));
    expect(await screen.findByText("操作已生效，但后续处理失败，请刷新确认并联系管理员修复")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it("deletes an assignment and refreshes its list", async () => {
    const requests = mutation("assignments.delete");
    const { user } = await assignments();
    await user.click(within(screen.getByRole("region", { name: "分配对象" })).getByText("删除"));
    await user.click(within((await screen.findAllByRole("dialog")).at(-1)!).getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("分配已删除")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
});

describe("Role inline profile through the role service", () => {
  it("keeps drafts across log tabs and cancels without writing", async () => {
    const requests = mutation("update");
    const { user } = await assignments();
    await user.click(profile().getByRole("button", { name: /编\s*辑/ }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(profile().queryByRole("textbox", { name: "角色编码" })).not.toBeInTheDocument();
    expect(profile().queryByRole("combobox", { name: "所属应用" })).not.toBeInTheDocument();
    const name = profile().getByRole("textbox", { name: "角色名称" });
    await user.clear(name);
    await user.type(name, "未保存草稿");
    await user.click(screen.getByRole("tab", { name: "操作日志" }));
    await user.click(screen.getByRole("tab", { name: "角色信息" }));
    expect(name).toHaveValue("未保存草稿");
    await user.click(profile().getByRole("button", { name: /取\s*消/ }));
    await user.click(profile().getByRole("button", { name: /编\s*辑/ }));
    expect(profile().getByRole("textbox", { name: "角色名称" })).toHaveValue(role.roleName);
    expect(requests).toEqual([]);
  });

  it("clears a description with null and submits only the touched field", async () => {
    server.use(
      http.get("*/rpc/admin.role.detail", () =>
        HttpResponse.json([{ result: { data: { ...role, description: "原描述" } } }]),
      ),
    );
    const requests = mutation("update");
    const { user } = await editRole();
    await user.clear(profile().getByRole("textbox", { name: "描述" }));
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("角色已更新")).toBeVisible();
    expect(requests).toEqual([{ "0": { roleCode: "reader", data: { description: null } } }]);
  });

  it("rejects untouched or blank-name saves without writing", async () => {
    const requests = mutation("update");
    const { user } = await editRole();
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("请先编辑需要保存的字段")).toBeVisible();
    const name = profile().getByRole("textbox", { name: "角色名称" });
    await user.clear(name);
    await user.type(name, "   ");
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    expect(await profile().findByText("请输入角色名称")).toBeVisible();
    expect(requests).toEqual([]);
  });

  it("discards an unsaved draft when closing and reopening the role", async () => {
    const requests = mutation("update");
    const { user } = await editRole();
    await user.type(profile().getByRole("textbox", { name: "角色名称" }), "草稿");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(await profile().findByRole("textbox", { name: "角色名称" })).toHaveValue(role.roleName);
    expect(requests).toEqual([]);
  });

  it("locks closing, tab changes and assignment writes while saving", async () => {
    let finishSave: () => void = () => {};
    const savingGate = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const requests: unknown[] = [];
    server.use(
      http.post("*/rpc/admin.role.update", async ({ request }) => {
        requests.push(await request.json());
        await savingGate;
        return HttpResponse.json([{ result: { data: { changed: true, result: null } } }]);
      }),
    );
    const { user } = await editRole();
    try {
      await user.type(profile().getByRole("textbox", { name: "角色名称" }), "修改");
      await user.click(profile().getByRole("button", { name: /保\s*存/ }));
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(profile().getByRole("button", { name: /取\s*消/ })).toBeDisabled();
      expect(profile().getByRole("textbox", { name: "角色名称" })).toBeDisabled();
      expect(screen.getByRole("region", { name: "分配对象" })).toHaveAttribute("inert");
      expect(screen.getByRole("tab", { name: "操作日志" })).toHaveAttribute("aria-disabled", "true");
      expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeVisible();
    } finally {
      finishSave();
    }
    await waitFor(() => expect(profile().queryByRole("textbox", { name: "角色名称" })).not.toBeInTheDocument());
    expect(requests).toHaveLength(1);
  });

  it("exits editing after a saved update even if refreshing the detail fails", async () => {
    const requests = mutation("update");
    const { user } = await editRole();
    const searchesBefore = reads.search.mock.calls.length;
    server.use(
      http.get("*/rpc/admin.role.detail", () =>
        HttpResponse.json([{ error: { message: "详情不可用", code: -32603, data: { httpStatus: 503 } } }], {
          status: 503,
        }),
      ),
    );
    await user.type(profile().getByRole("textbox", { name: "角色名称" }), "修改");
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText(/基本信息已保存，但详情刷新失败/)).toBeVisible();
    expect(profile().queryByRole("textbox", { name: "角色名称" })).not.toBeInTheDocument();
    await waitFor(() => expect(reads.search.mock.calls.length).toBeGreaterThan(searchesBefore));
    expect(requests).toHaveLength(1);
  });

  it("includes an explicitly edited status", async () => {
    const requests = mutation("update");
    const { user } = await editRole();
    await user.click(profile().getByRole("combobox", { name: "状态" }));
    await user.click(
      await screen.findByText("暂停", {
        selector: ".ant-select-item-option-content",
      }),
    );
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("角色已更新")).toBeInTheDocument();
    expect(requests).toEqual([{ "0": { roleCode: "reader", data: { status: 2 } } }]);
  });
  it("completes a no-op edit and omits untouched status", async () => {
    const requests = mutation("update", false);
    const { user } = await editRole();
    const name = profile().getByRole("textbox", { name: "角色名称" });
    await user.clear(name);
    await user.type(name, role.roleName);
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("无需修改")).toBeInTheDocument();
    expect(requests).toEqual([{ "0": { roleCode: "reader", data: { roleName: role.roleName } } }]);
    await waitFor(() => expect(profile().queryByRole("textbox", { name: "角色名称" })).not.toBeInTheDocument());
    expect(reads.detail.mock.calls.length).toBeGreaterThan(1);
  });

  it.each([404, 409])("keeps an ordinary rejected edit open (%s)", async (status) => {
    const requests = mutation("update", false, status);
    const { user } = await editRole();
    const name = profile().getByRole("textbox", { name: "角色名称" });
    await user.type(name, "草稿");
    await user.click(profile().getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("角色写入失败")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(name).toHaveValue(`${role.roleName}草稿`);
    expect(reads.detail).toHaveBeenCalledTimes(1);
  });
});
