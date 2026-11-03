import EmploymentDetailDrawer from "@admin/pages/employments/components/EmploymentDetailDrawer";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
import { ConfigProvider, Modal, message } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHrEmploymentAllowedActions } from "~admin/test/mocks/fixtures";
import { act, cleanup, render, screen, waitFor, within } from "~admin/test/render";

const services = vi.hoisted(() => ({
  setPrimaryEmployment: vi.fn(),
  clearPrimaryEmployment: vi.fn(),
  endEmployment: vi.fn(),
  getEmployment: vi.fn(),
  pauseEmployment: vi.fn(),
  resumeEmployment: vi.fn(),
  searchAssignments: vi.fn(),
  updateEmployment: vi.fn(),
}));

beforeEach(() => {
  ConfigProvider.config({
    holderRender: (children) => <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>,
  });
  services.searchAssignments.mockResolvedValue({ items: [], total: 0, nextCursor: null });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    Modal.destroyAll();
    message.destroy();
  });
  ConfigProvider.config({ holderRender: undefined });
  await waitFor(() => expect(screen.queryAllByRole("dialog")).toHaveLength(0));
});

vi.mock("@admin/services/employment", () => ({
  setPrimaryEmployment: services.setPrimaryEmployment,
  clearPrimaryEmployment: services.clearPrimaryEmployment,
  endEmployment: services.endEmployment,
  getEmployment: services.getEmployment,
  pauseEmployment: services.pauseEmployment,
  resumeEmployment: services.resumeEmployment,
  updateEmployment: services.updateEmployment,
}));
vi.mock("@admin/services/organization-responsibility", () => ({
  searchOrganizationResponsibilityAssignments: services.searchAssignments,
}));
vi.mock("@admin/components/audit/AuditLogTable", () => ({
  default: () => null,
}));
vi.mock("@admin/pages/employments/components/TransferModal", () => ({
  default: () => null,
}));
const now = new Date("2026-08-20T00:00:00.000Z");
const employment = {
  id: 42,
  userId: 7,
  posId: 8,
  orgId: 3,
  isPrimary: true,
  status: EmploymentStatus.Enable,
  startTime: now,
  endTime: null,
  description: null,
  isDelete: false,
  createTime: now,
  updateTime: now,
  user: {
    id: 7,
    username: "zhangsan",
    name: "张三",
    mobile: null,
    wxId: null,
  },
  position: { id: 8, posCode: "OPS-LEAD", posName: "运营负责人" },
  organization: {
    assignedOrg: {
      id: 3,
      orgCode: "OPS",
      orgName: "运营部",
      orgType: OrganizationType.Department,
      level: OrganizationLevel.Two,
      parentId: 1,
      isVirtual: false,
      isEntity: true,
      pathIndex: 1,
      distanceToAssignedOrg: 0,
    },
    fullOrgPath: [],
    companyNodes: [],
  },
  roles: [],

  allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Enable, true),
};

const assignment = {
  id: 101,
  typeCode: OrganizationResponsibilityTypeCode.Head,
  targetOrganization: {
    id: 4,
    orgCode: "FIN",
    orgName: "财务部",
    fullPath: [{ id: 4, orgCode: "FIN", orgName: "财务部" }],
  },
  holder: {
    employmentId: 42,
    user: { id: 7, name: "张三", username: "zhangsan" },
    organization: {
      id: 3,
      orgCode: "OPS",
      orgName: "运营部",
      fullPath: [{ id: 3, orgCode: "OPS", orgName: "运营部" }],
    },
    position: { id: 8, posCode: "OPS-LEAD", posName: "运营负责人" },
  },
  status: OrganizationResponsibilityAssignmentStatus.Pause,
  startTime: now,
  endTime: null,
};

describe("EmploymentDetailDrawer responsibility wayfinding", () => {
  it("preserves distinct roles with the same display name", async () => {
    services.getEmployment.mockResolvedValue({
      ...employment,
      roles: ["app:admin", "other:admin"],

      roleNames: { "app:admin": "管理员", "other:admin": "管理员" },
    });
    render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />);
    await screen.findByRole("region", { name: "基本信息" });
    expect(screen.getAllByText("管理员")).toHaveLength(2);
    expect(screen.queryByText("app:admin")).not.toBeInTheDocument();
  });

  it("replaces the roles when the selected Employment detail changes", async () => {
    services.getEmployment
      .mockResolvedValueOnce({
        ...employment,
        id: 42,
        roles: ["app:reader", "app:editor"],
        roleNames: { "app:reader": "读取角色", "app:editor": "编辑角色" },
      })
      .mockResolvedValueOnce({
        ...employment,
        id: 43,
        roles: ["app:reader"],
        roleNames: { "app:reader": "读取角色" },
      });
    const props = { open: true, onClose: vi.fn() };
    const view = render(<EmploymentDetailDrawer {...props} employmentId={42} />);

    await screen.findByRole("region", { name: "基本信息" });
    expect(screen.getByText("读取角色")).toBeInTheDocument();
    expect(screen.getByText("编辑角色")).toBeInTheDocument();

    view.rerender(<EmploymentDetailDrawer {...props} employmentId={43} />);
    await screen.findByRole("region", { name: "基本信息" });
    expect(screen.queryByText("编辑角色")).not.toBeInTheDocument();
    expect(screen.getByText("读取角色")).toBeInTheDocument();
  });

  it("edits description and renders only the server-granted lifecycle actions", async () => {
    services.getEmployment.mockResolvedValue(employment);
    services.updateEmployment.mockResolvedValue({
      changed: true,
      result: null,
    });
    const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />);

    const edit = await screen.findByRole("button", { name: "编辑备注" });
    expect(edit).toBeEnabled();
    for (const action of [/暂\s*停/, /结\s*束/]) {
      expect(screen.getByRole("button", { name: action })).toBeEnabled();
    }
    for (const label of ["转岗", "取消主岗"]) {
      expect(
        screen.getByRole("button", {
          name: label === "转岗" ? /转\s*岗/ : label,
        }),
      ).toBeEnabled();
    }
    await user.click(edit);
    await user.type(screen.getByRole("textbox", { name: "备注" }), "HR note");
    await user.click(screen.getByRole("button", { name: /保\s*存/ }));

    expect(services.updateEmployment).toHaveBeenCalledWith(42, {
      description: "HR note",
    });
  });

  it("shows the Employment open assignments and links to the global context", async () => {
    services.getEmployment.mockResolvedValue(employment);
    services.searchAssignments.mockResolvedValue({
      items: [assignment],
      nextCursor: null,
    });
    render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />);

    await screen.findByRole("region", { name: "组织责任" });

    expect(services.searchAssignments).toHaveBeenCalledWith({
      employmentId: 42,
      lifecycle: "open",
      limit: 20,
    });
    expect((await screen.findAllByText("暂停")).length).toBeGreaterThan(0);
    expect(screen.getByText("负责人")).toBeVisible();
    expect(screen.getByRole("link", { name: "财务部" })).toHaveAttribute(
      "href",
      "/organization-responsibilities/assignments?employment=42&lifecycle=open&assignment=101",
    );
    expect(screen.queryByText("#101")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /#101/ })).not.toBeInTheDocument();
  });
});

describe("Employment mutation outcomes", () => {
  afterEach(async () => {
    message.destroy();
    Modal.destroyAll();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: /^(暂停任职|结束任职)$/,
          hidden: true,
        }),
      ).not.toBeInTheDocument(),
    );
  });
  it.each(["setPrimary", "clearPrimary"] as const)(
    "shows %s no-op and keeps refreshed facts instead of toggling the stale record",
    async (command) => {
      const isPrimary = command === "clearPrimary";
      const current = {
        ...employment,
        isPrimary,
        allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Enable, isPrimary),
      };
      services.getEmployment.mockResolvedValue(current);
      services[`${command}Employment`].mockResolvedValue({
        changed: false,
        result: null,
      });
      const info = vi.spyOn(message, "info");
      const confirm = vi.spyOn(Modal, "confirm").mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }));
      const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />);
      await user.click(
        await screen.findByRole("button", {
          name: isPrimary ? "取消主岗" : "设主岗",
        }),
      );
      await confirm.mock.calls[0][0].onOk?.();
      await waitFor(() => expect(services.getEmployment).toHaveBeenCalledTimes(2));
      expect(info).toHaveBeenCalledWith("无需修改");
      expect(screen.getByRole("button", { name: isPrimary ? "取消主岗" : "设主岗" })).toBeVisible();
      expect(services[`${command}Employment`]).toHaveBeenCalledExactlyOnceWith(42);
      confirm.mockRestore();
    },
  );

  it.each(["setPrimary", "clearPrimary"] as const)(
    "refreshes after %s committed failure and keeps the repair warning",
    async (command) => {
      const isPrimary = command === "clearPrimary";
      services.getEmployment.mockResolvedValue({
        ...employment,
        isPrimary,
        allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Enable, isPrimary),
      });
      services[`${command}Employment`].mockRejectedValue(new AdminMutationCommittedError(null));
      const confirm = vi.spyOn(Modal, "confirm").mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }));
      const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />);
      await user.click(
        await screen.findByRole("button", {
          name: isPrimary ? "取消主岗" : "设主岗",
        }),
      );
      await confirm.mock.calls[0][0].onOk?.();
      await waitFor(() => expect(services.getEmployment).toHaveBeenCalledTimes(2));
      expect(screen.getByText("操作已生效，但后续处理失败，请刷新确认并联系管理员修复")).toBeVisible();
      expect(services[`${command}Employment`]).toHaveBeenCalledOnce();
      confirm.mockRestore();
    },
  );

  it.each(["pause", "resume", "end", "update"] as const)(
    "shows no-op for %s and reloads current facts",
    async (command) => {
      const status = command === "resume" ? EmploymentStatus.Pause : EmploymentStatus.Enable;
      services.getEmployment.mockResolvedValue({
        ...employment,
        status,
        allowedActions: createHrEmploymentAllowedActions(status, true),
      });
      const mutation = services[`${command}Employment`];
      mutation.mockResolvedValue({ changed: false, result: null });
      const info = vi.spyOn(message, "info");
      const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />);
      await screen.findByRole("button", { name: "编辑备注" });
      if (command === "update") {
        await user.click(screen.getByRole("button", { name: "编辑备注" }));
        await user.click(screen.getByRole("button", { name: /保\s*存/ }));
      } else if (command === "resume") {
        await user.click(screen.getByRole("button", { name: /恢\s*复/ }));
      } else {
        await user.click(
          screen.getByRole("button", {
            name: command === "pause" ? /^暂\s*停$/ : /^结\s*束$/,
          }),
        );
        await user.click(
          await screen.findByRole("button", {
            name: command === "pause" ? "暂停任职" : "结束任职",
          }),
        );
      }
      await waitFor(() => expect(info).toHaveBeenCalledWith("无需修改"));
      await waitFor(() => expect(services.getEmployment).toHaveBeenCalledTimes(2));
      expect(mutation).toHaveBeenCalledOnce();
    },
  );

  it.each(["pause", "resume", "end", "update"] as const)(
    "preserves the committed warning after %s refresh without replaying",
    async (command) => {
      const status = command === "resume" ? EmploymentStatus.Pause : EmploymentStatus.Enable;
      services.getEmployment.mockResolvedValue({
        ...employment,
        status,
        allowedActions: createHrEmploymentAllowedActions(status, true),
      });
      const mutation = services[`${command}Employment`];
      mutation.mockRejectedValue(new AdminMutationCommittedError(null));
      const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />);
      await screen.findByRole("button", { name: "编辑备注" });
      if (command === "update") {
        await user.click(screen.getByRole("button", { name: "编辑备注" }));
        await user.click(screen.getByRole("button", { name: /保\s*存/ }));
      } else if (command === "resume") {
        await user.click(screen.getByRole("button", { name: /恢\s*复/ }));
      } else {
        await user.click(
          screen.getByRole("button", {
            name: command === "pause" ? /^暂\s*停$/ : /^结\s*束$/,
          }),
        );
        await user.click(
          await screen.findByRole("button", {
            name: command === "pause" ? "暂停任职" : "结束任职",
          }),
        );
      }
      await waitFor(() => expect(services.getEmployment).toHaveBeenCalledTimes(2));
      expect(screen.getByText("操作已生效，但后续处理失败，请刷新确认并联系管理员修复")).toBeVisible();
      expect(mutation).toHaveBeenCalledOnce();
    },
  );
});

describe("Employment inline description editing", () => {
  it("keeps a draft across tabs and discards it when cancelled", async () => {
    services.getEmployment.mockResolvedValue({ ...employment, description: "原备注" });
    const onChanged = vi.fn();
    const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} onChanged={onChanged} />);
    await user.click(await screen.findByRole("button", { name: "编辑备注" }));
    const basic = within(screen.getByRole("region", { name: "基本信息" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.clear(basic.getByRole("textbox", { name: "备注" }));
    await user.type(basic.getByRole("textbox", { name: "备注" }), "未保存的备注");
    await user.click(screen.getByRole("tab", { name: "操作日志" }));
    await user.click(screen.getByRole("tab", { name: "任职信息" }));
    expect(basic.getByRole("textbox", { name: "备注" })).toHaveValue("未保存的备注");
    await user.click(basic.getByRole("button", { name: /取\s*消/ }));
    await user.click(screen.getByRole("button", { name: "编辑备注" }));
    expect(basic.getByRole("textbox", { name: "备注" })).toHaveValue("原备注");
    expect(services.updateEmployment).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("preserves the draft when saving is rejected without replaying the write", async () => {
    services.getEmployment.mockResolvedValue(employment);
    services.updateEmployment.mockRejectedValue(new Error("备注修改被拒绝"));
    const onChanged = vi.fn();
    const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} onChanged={onChanged} />);
    await user.click(await screen.findByRole("button", { name: "编辑备注" }));
    await user.type(screen.getByRole("textbox", { name: "备注" }), "保留草稿");
    await user.click(screen.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("备注修改被拒绝")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("保留草稿");
    expect(screen.getByRole("button", { name: /保\s*存/ })).toBeEnabled();
    expect(services.updateEmployment).toHaveBeenCalledExactlyOnceWith(42, { description: "保留草稿" });
    expect(services.getEmployment).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("clears an existing description and reloads the saved fact", async () => {
    services.getEmployment
      .mockResolvedValueOnce({ ...employment, description: "原备注" })
      .mockResolvedValue(employment);
    services.updateEmployment.mockResolvedValue({ changed: true, result: null });
    const onChanged = vi.fn();
    const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} onChanged={onChanged} />);
    await user.click(await screen.findByRole("button", { name: "编辑备注" }));
    await user.clear(screen.getByRole("textbox", { name: "备注" }));
    await user.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(services.updateEmployment).toHaveBeenCalledExactlyOnceWith(42, { description: null });
    expect(screen.queryByRole("textbox", { name: "备注" })).not.toBeInTheDocument();
    expect(screen.queryByText("原备注")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑备注" })).toBeEnabled();
  });

  it.each([false, true])(
    "finishes an acknowledged update when detail refresh fails, committed=%s",
    async (committed) => {
      services.getEmployment.mockResolvedValueOnce(employment).mockRejectedValue(new Error("详情暂不可用"));
      if (committed) services.updateEmployment.mockRejectedValue(new AdminMutationCommittedError(null));
      else services.updateEmployment.mockResolvedValue({ changed: true, result: null });
      const onChanged = vi.fn();
      const { user } = render(
        <EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} onChanged={onChanged} />,
      );
      await user.click(await screen.findByRole("button", { name: "编辑备注" }));
      await user.type(screen.getByRole("textbox", { name: "备注" }), "已保存的备注");
      await user.click(screen.getByRole("button", { name: /保\s*存/ }));
      expect(await screen.findByText(/备注已保存，但详情刷新失败/)).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "备注" })).not.toBeInTheDocument();
      if (committed) expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("操作已生效");
      expect(services.updateEmployment).toHaveBeenCalledTimes(1);
      expect(services.getEmployment).toHaveBeenCalledTimes(2);
      expect(onChanged).toHaveBeenCalledTimes(1);
    },
  );

  it("starts a fresh description editor when the selected Employment changes", async () => {
    services.getEmployment.mockResolvedValueOnce({ ...employment, description: "第一段任职备注" }).mockResolvedValue({
      ...employment,
      id: 43,
      description: "第二段任职备注",
    });
    const props = { open: true, onClose: vi.fn() };
    const view = render(<EmploymentDetailDrawer {...props} employmentId={42} />);
    await view.user.click(await screen.findByRole("button", { name: "编辑备注" }));
    await view.user.type(screen.getByRole("textbox", { name: "备注" }), "未保存内容");
    view.rerender(<EmploymentDetailDrawer {...props} employmentId={43} />);
    await view.user.click(await screen.findByRole("button", { name: "编辑备注" }));
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("第二段任职备注");
    expect(services.updateEmployment).not.toHaveBeenCalled();
  });

  it("keeps ended Employment descriptions read-only", async () => {
    services.getEmployment.mockResolvedValue({
      ...employment,
      status: EmploymentStatus.Disable,
      isPrimary: false,
      allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Disable, false),
    });
    const { user } = render(<EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />);
    const edit = await screen.findByRole("button", { name: "编辑备注" });
    expect(edit).toBeDisabled();
    await user.click(edit);
    expect(screen.queryByRole("textbox", { name: "备注" })).not.toBeInTheDocument();
    expect(services.updateEmployment).not.toHaveBeenCalled();
  });
});
