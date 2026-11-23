import OrganizationsPage from "@admin/pages/organizations";
import { ApiErrorCode, OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { ConfigProvider, Modal, message } from "antd";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "~admin/test/mocks/server";
import { cleanup, render, screen, setTestAccess, waitFor, within } from "~admin/test/render";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();

vi.mock("@admin/constants/config", () => ({
  API_PREFIX: "http://localhost",
  SSO_CLIENT_CODE: "iam-admin",
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

const allowed = { allowed: true, reason: null } as const;
const organization = {
  id: 10,
  orgCode: "ROOT-A",
  orgName: "Root A",
  parentId: -1,
  businessParentId: -1,
  path: "/10",
  level: OrganizationLevel.One,
  orgType: OrganizationType.Company,
  orderNum: 0,
  isVirtual: false,
  isEntity: true,
  status: OrganizationStatus.Enable,
  isDelete: false,
  createTime: "2026-01-01T00:00:00Z",
  updateTime: "2026-01-01T00:00:00Z",
  isLeaf: true,
  parentCode: null,
  parentName: null,
  statusText: "正常",
  childrenCount: 0,
  employmentCount: 0,
  allowedActions: {
    createChild: allowed,
    edit: allowed,
    changeStatus: allowed,
    delete: allowed,
  },
};
const reads = { detail: vi.fn(), children: vi.fn() };
let fullPath: { orgCode: string; orgName: string }[];
const costCenter = {
  entityType: "organization",
  code: "cost_center",
  displayName: "成本中心",
  description: null,
  orderNum: 0,
  enabled: true,
  valueType: "text",
  options: [],
} as const;
let definitions: Array<typeof costCenter>;
let detailAttributes: Record<string, string>;
beforeEach(() => {
  fullPath = [organization];
  definitions = [];
  detailAttributes = {};
  setTestAccess({
    canCreateOrganizationRoot: true,
    canAccessOrganizationResponsibility: false,
  });
  reads.detail.mockReset();
  reads.children.mockReset();
  server.use(
    http.get("*/rpc/:procedures", ({ params, request }) => {
      const procedures = String(params.procedures).split(",");
      const input = JSON.parse(new URL(request.url).searchParams.get("input") ?? "{}");
      return HttpResponse.json(
        procedures.map((procedure, index) => {
          if (procedure === "admin.organization.detail") {
            reads.detail();
            return {
              result: {
                data: { ...organization, customAttributeDefinitions: definitions, customAttributes: detailAttributes },
              },
            };
          }
          if (procedure === "admin.customAttribute.list") {
            return { result: { data: definitions } };
          }
          if (procedure === "admin.organization.selector") {
            return {
              result: {
                data: [{ ...organization, fullPath }],
              },
            };
          }
          reads.children();
          const result = input[index]?.parentOrgCode === null ? [organization] : [];
          return {
            result: {
              data: { result, total: result.length, pageNum: 1, pageSize: 50 },
            },
          };
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
    http.post(`*/rpc/admin.organization.${procedure}`, async ({ request }) => {
      requests.push(await request.json());
      return status
        ? HttpResponse.json(
            [
              {
                error: {
                  message: status === 409 ? "组织冲突" : "组织不存在",
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
                data: {
                  changed,
                  result: procedure === "create" ? organization : null,
                },
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
      <OrganizationsPage />
    </ConfigProvider>,
  );
  await view.user.click(await screen.findByText("(ROOT-A)"));
  await screen.findByRole("button", { name: /编\s*辑/ });
  return view;
}

describe("OrganizationsPage mutation results through the organization service", () => {
  it("creates an organization attribute definition and applies it to the creation form", async () => {
    const creationRequests = mutation("create");
    const definitionRequests: unknown[] = [];
    server.use(
      http.post("*/rpc/admin.customAttribute.create", async ({ request }) => {
        definitionRequests.push(await request.json());
        definitions = [costCenter];
        return HttpResponse.json([{ result: { data: { changed: true, result: costCenter } } }]);
      }),
    );
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: "自定义属性" }));
    const drawer = within(await screen.findByRole("dialog", { name: "自定义属性定义" }));
    await user.click(await drawer.findByRole("button", { name: "新建属性定义" }));
    await user.type(drawer.getByRole("textbox", { name: /属性编码/ }), "cost_center");
    await user.type(drawer.getByRole("textbox", { name: /显示名称/ }), "成本中心");
    await user.click(drawer.getByRole("button", { name: "保存定义" }));
    expect(await drawer.findByText("成本中心")).toBeInTheDocument();
    expect(definitionRequests).toMatchObject([{ "0": { entityType: "organization", code: "cost_center" } }]);
    await user.click(drawer.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "新建根组织" }));
    const form = within(await screen.findByRole("dialog"));
    await user.type(form.getByRole("textbox", { name: "组织编码" }), "NEW");
    await user.type(form.getByRole("textbox", { name: "组织名称" }), "新组织");
    await user.type(await form.findByRole("textbox", { name: "成本中心" }), "FIN-2");
    await user.click(form.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("创建成功")).toBeInTheDocument();
    expect(creationRequests).toMatchObject([{ "0": { customAttributes: { cost_center: "FIN-2" } } }]);
  });

  it("shows the current organization value in details and submits a clear from edit", async () => {
    const requests = mutation("update");
    definitions = [costCenter];
    detailAttributes = { cost_center: "FIN-1" };
    const { user } = await page();
    expect(await screen.findByText("FIN-1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /编\s*辑/ }));
    const form = within(await screen.findByRole("dialog", { name: "编辑组织" }));
    const costCenterField = await form.findByRole("textbox", { name: "成本中心" });
    expect(costCenterField).toHaveValue("FIN-1");
    await user.clear(costCenterField);
    await user.click(form.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("更新成功")).toBeInTheDocument();
    expect(requests).toMatchObject([{ "0": { data: { customAttributes: { cost_center: null } } } }]);
  });
  it.each([
    [[organization], "ROOT-A（Root A）"],
    [
      [{ orgCode: "GROUP", orgName: "集团" }, { orgCode: "COMPANY", orgName: "公司" }, organization],
      "GROUP（集团） / COMPANY（公司） / ROOT-A（Root A）",
    ],
  ])("shows organization codes and names for the full path", async (nodes, label) => {
    fullPath = nodes;
    await page();
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText("/10")).not.toBeInTheDocument();
  });

  it("creates only an enabled organization and refreshes the tree", async () => {
    const requests = mutation("create");
    const { user } = await page();
    const initialReads = reads.children.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "新建根组织" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getAllByRole("textbox")[0], "  NEW  ");
    await user.type(dialog.getAllByRole("textbox")[1], "  新组织  ");
    await user.click(dialog.getAllByRole("combobox")[1]);
    expect(
      screen.queryByText("暂停", {
        selector: ".ant-select-item-option-content",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("停用", {
        selector: ".ant-select-item-option-content",
      }),
    ).not.toBeInTheDocument();
    await user.click(dialog.getByRole("textbox", { name: "组织名称" }));
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("创建成功")).toBeInTheDocument();
    expect(requests).toMatchObject([
      {
        "0": {
          orgCode: "NEW",
          orgName: "新组织",
          status: OrganizationStatus.Enable,
        },
      },
    ]);
    await waitFor(() => expect(reads.children.mock.calls.length).toBeGreaterThan(initialReads));
  });
  it.each([true, false])("reports edit changed=%s and omits untouched status", async (changed) => {
    const requests = mutation("update", changed);
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: /编\s*辑/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText(changed ? "更新成功" : "无需修改")).toBeInTheDocument();
    expect(requests).toEqual([
      {
        "0": {
          orgCode: "ROOT-A",
          data: { orgName: "Root A", orgType: OrganizationType.Company },
        },
      },
    ]);
    await waitFor(() => expect(reads.detail.mock.calls.length).toBeGreaterThan(1));
  });
  it("normalizes an edited organization name before submitting", async () => {
    const requests = mutation("update");
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: /编\s*辑/ }));
    const dialog = within(await screen.findByRole("dialog"));
    const nameInput = dialog.getByRole("textbox", { name: "组织名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "  Renamed organization  ");
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("更新成功")).toBeInTheDocument();
    expect(requests).toMatchObject([
      {
        "0": {
          orgCode: "ROOT-A",
          data: { orgName: "Renamed organization" },
        },
      },
    ]);
  });
  it("includes an explicitly changed edit status", async () => {
    const requests = mutation("update");
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: /编\s*辑/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("combobox", { name: "状态" }));
    await user.click(
      await screen.findByText("暂停", {
        selector: ".ant-select-item-option-content",
      }),
    );
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("更新成功")).toBeInTheDocument();
    expect(requests).toMatchObject([{ "0": { data: { status: OrganizationStatus.Pause } } }]);
  });
  it.each([404, 409])("keeps a rejected edit open for HTTP %s", async (status) => {
    const requests = mutation("update", false, status);
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: /编\s*辑/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText(status === 409 ? "组织冲突" : "组织不存在")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it("refreshes committed facts without replay and retains the repair warning", async () => {
    const requests = mutation("update", false, 500, true);
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: /编\s*辑/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    await waitFor(() => expect(reads.detail.mock.calls.length).toBeGreaterThan(1));
    expect(await screen.findByText("操作已生效，但后续处理失败，请刷新确认并联系管理员修复")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it.each([true, false])("reports status changed=%s and refreshes the selected detail", async (changed) => {
    const requests = mutation("updateStatus", changed);
    const { user } = await page();
    await user.hover(screen.getByRole("button", { name: /状\s*态/ }));
    await user.click(await screen.findByText("切为「暂停」"));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "确认变更" }));
    expect(await screen.findByText(changed ? "状态已更新" : "无需修改")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    await waitFor(() => expect(reads.detail.mock.calls.length).toBeGreaterThan(1));
  });
  it("clears the selected detail after deletion", async () => {
    const requests = mutation("delete");
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: /删\s*除/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("已删除")).toBeInTheDocument();
    expect(await screen.findByText("请选择左侧组织查看详情")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
});
