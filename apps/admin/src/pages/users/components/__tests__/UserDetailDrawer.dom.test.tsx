import UserDetailDrawer from "@admin/pages/users/components/UserDetailDrawer";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import {
  type AdminUserAllowedActions,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { ConfigProvider, Modal, message } from "antd";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHrEmploymentAllowedActions } from "~admin/test/mocks/fixtures";
import { __setAccess } from "~admin/test/mocks/umijs-max";
import { act, render, screen, waitFor, within } from "~admin/test/render";

const lifecycle = vi.hoisted(() => ({
  clearPrimaryEmployment: vi.fn(),
  confirmResetPassword: vi.fn(),
  endEmployment: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  updateUserStatus: vi.fn(),
  pauseEmployment: vi.fn(),
  resignUser: vi.fn(),
  resumeEmployment: vi.fn(),
  searchAssignments: vi.fn(),
  setPrimaryEmployment: vi.fn(),
}));

vi.mock("@admin/components/StatusTag", () => ({
  default: ({ status }: { status: number }) => <span>{status}</span>,
}));
vi.mock("@admin/components/audit/AuditLogTable", () => ({
  default: () => null,
}));
vi.mock("@admin/pages/employments/components/EmploymentFormModal", () => ({
  default: () => null,
}));
vi.mock("@admin/pages/employments/components/TransferModal", () => ({
  default: ({ employment, open }: { employment: { id: number } | null; open: boolean }) =>
    open ? (
      <div aria-label="转岗任职" role="dialog">
        {employment?.id}
      </div>
    ) : null,
}));
vi.mock("@admin/pages/users/components/ResetPasswordModal", () => ({
  confirmResetPassword: lifecycle.confirmResetPassword,
}));

vi.mock("@admin/services/employment", () => ({
  clearPrimaryEmployment: lifecycle.clearPrimaryEmployment,
  endEmployment: lifecycle.endEmployment,
  pauseEmployment: lifecycle.pauseEmployment,
  resignUser: lifecycle.resignUser,
  resumeEmployment: lifecycle.resumeEmployment,
  setPrimaryEmployment: lifecycle.setPrimaryEmployment,
}));
vi.mock("@admin/services/user", () => ({
  deleteUser: lifecycle.deleteUser,
  getUser: lifecycle.getUser,
  updateUserStatus: lifecycle.updateUserStatus,
}));
vi.mock("@admin/services/organization-responsibility", () => ({
  searchOrganizationResponsibilityAssignments: lifecycle.searchAssignments,
}));

vi.mock("@ant-design/pro-components", () => {
  const ProDescriptions = ({
    dataSource,
    columns,
  }: {
    dataSource: Record<string, unknown>;
    columns: {
      dataIndex: unknown;
      title?: string;
      render?: (_: unknown, row: typeof dataSource) => ReactNode;
    }[];
  }) => (
    <>
      {columns
        .filter((column) => column.dataIndex === "roles")
        .map((column) => (
          <section aria-label={column.title} key={String(column.dataIndex)}>
            {column.render?.(null, dataSource)}
          </section>
        ))}
    </>
  );
  return {
    default: { ProDescriptions },
    ProDescriptions,
  };
});

const now = new Date("2026-01-01T00:00:00.000Z");
const allowed = { allowed: true, reason: null } as const;
const denied = { allowed: false, reason: "ACTION_NOT_GRANTED" } as const;
const fullAdminActions = {
  editProfile: allowed,
  resetPassword: allowed,
  changeStatus: allowed,
  delete: allowed,
  resign: allowed,
};
const organization = {
  assignedOrg: {
    id: 2,
    orgCode: "ORG",
    orgName: "Organization",
    orgType: OrganizationType.Department,
    level: OrganizationLevel.Two,
    parentId: -1,
    isVirtual: false,
    isEntity: true,
    pathIndex: 1,
    distanceToAssignedOrg: 0,
  },
  fullOrgPath: [],
  companyNodes: [
    {
      id: 20,
      orgCode: "COMPANY",
      orgName: "Company",
      orgType: OrganizationType.Company,
      level: OrganizationLevel.One,
      parentId: -1,
      isVirtual: false,
      isEntity: true,
      pathIndex: 0,
      distanceToAssignedOrg: 1,
    },
  ],
};

function detail(
  employmentStatus: EmploymentStatus,
  isPrimary = true,
  allowedActions: AdminUserAllowedActions = fullAdminActions,
) {
  return {
    id: 1,
    username: "zhangsan",
    name: "张三",
    mobile: null,
    wxId: null,
    userType: UserType.Formal,
    orderNum: 0,
    status: UserStatus.Enable,
    isDelete: false,
    createTime: now,
    updateTime: now,
    roles: [],

    allowedActions,
    employments: [
      {
        id: 4,
        userId: 1,
        posId: 3,
        orgId: 2,
        isPrimary,
        status: employmentStatus,
        startTime: now,
        endTime: employmentStatus === EmploymentStatus.Disable ? now : null,
        description: null,
        isDelete: false,
        createTime: now,
        updateTime: now,
        user: {
          id: 1,
          username: "zhangsan",
          name: "张三",
          mobile: null,
          wxId: null,
        },
        position: { id: 3, posCode: "DEV", posName: "Developer" },
        organization,
        roles: ["iam:hr-admin"],

        allowedActions: createHrEmploymentAllowedActions(employmentStatus, isPrimary),
        managementPath: employmentStatus === EmploymentStatus.Disable ? null : "/employments?employmentId=4",
      },
    ],
  };
}

describe("UserDetailDrawer Employment lifecycle actions", () => {
  it.each([UserStatus.Enable, UserStatus.Pause, UserStatus.Disable])(
    "gates new Employment by User status %s",
    async (status) => {
      __setAccess({ canAccessEmployment: true, canCreateEmployment: true });
      lifecycle.getUser.mockResolvedValue({
        ...detail(EmploymentStatus.Enable),
        status,
      });
      const { user } = render(
        <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />,
      );
      await user.click(await screen.findByRole("tab", { name: /雇佣/ }));
      const create = screen.getByRole("button", { name: /新增雇佣/ });
      if (status === UserStatus.Disable) expect(create).toBeDisabled();
      else expect(create).toBeEnabled();
    },
  );

  it("displays the role name in the user summary", async () => {
    lifecycle.getUser.mockResolvedValue({
      ...detail(EmploymentStatus.Enable),
      roles: ["iam:hr-admin"],
      roleNames: { "iam:hr-admin": "人事管理员" },
    });
    render(<UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText("人事管理员")).toBeInTheDocument();
    expect(screen.queryByText("iam:hr-admin")).not.toBeInTheDocument();
  });

  it("replaces the roles when the selected user detail changes", async () => {
    lifecycle.getUser
      .mockResolvedValueOnce({
        ...detail(EmploymentStatus.Enable),
        username: "first",
        roles: ["first:reader", "first:editor"],
        roleNames: { "first:reader": "读取角色", "first:editor": "编辑角色" },
      })
      .mockResolvedValueOnce({
        ...detail(EmploymentStatus.Enable),
        username: "second",
        roles: ["second:reader"],
        roleNames: { "second:reader": "其他读取角色" },
      });
    const props = {
      open: true,
      onClose: vi.fn(),
      onEdit: vi.fn(),
      onChanged: vi.fn(),
    };
    const view = render(<UserDetailDrawer {...props} username="first" />);

    expect(await screen.findByText("编辑角色")).toBeInTheDocument();

    view.rerender(<UserDetailDrawer {...props} username="second" />);
    expect(await screen.findByText("其他读取角色")).toBeInTheDocument();
    expect(screen.queryByText("编辑角色")).not.toBeInTheDocument();
  });

  beforeEach(() => {
    ConfigProvider.config({
      holderRender: (children) => <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>,
    });
  });

  afterEach(async () => {
    await act(async () => {
      Modal.destroyAll();
      message.destroy();
    });
    ConfigProvider.config({ holderRender: undefined });
  });

  describe("resignation outcomes", () => {
    const hrActions = {
      editProfile: denied,
      resetPassword: denied,
      changeStatus: denied,
      delete: denied,
      resign: allowed,
    };

    async function confirmResignation(user: ReturnType<typeof render>["user"]) {
      await user.click(await screen.findByRole("button", { name: /离\s*职/ }));
      const titles = await screen.findAllByText("办理用户 张三 离职？");
      const dialog = titles.find((title) => title.classList.contains("ant-modal-confirm-title"))?.closest(".ant-modal");
      expect(dialog).not.toBeNull();
      await user.click(within(dialog as HTMLElement).getByRole("button", { name: /确\s*定/ }));
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
    }

    async function submitResignation(role: "Full Admin" | "HR" = "Full Admin") {
      __setAccess({
        canAccessUser: true,
        canAccessEmployment: true,
        canAccessOrganizationResponsibility: false,
        canAccessAudit: role === "Full Admin",
        canCreateEmployment: role === "Full Admin",
      });
      const onChanged = vi.fn();
      const { user } = render(
        <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={onChanged} />,
      );
      await confirmResignation(user);
      return onChanged;
    }

    it("refreshes the completed resignation and permits an explicit no-op submission", async () => {
      lifecycle.getUser
        .mockResolvedValueOnce(detail(EmploymentStatus.Enable))
        .mockResolvedValue({ ...detail(EmploymentStatus.Disable, false), status: UserStatus.Disable });
      lifecycle.resignUser
        .mockResolvedValueOnce({ changed: true, result: null })
        .mockResolvedValue({ changed: false, result: null });
      const onChanged = vi.fn();
      const { user } = render(
        <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={onChanged} />,
      );

      await confirmResignation(user);
      expect(await screen.findByText("离职已完成")).toBeInTheDocument();
      await waitFor(() => expect(lifecycle.getUser).toHaveBeenCalledTimes(2));
      expect(screen.getByRole("button", { name: /离\s*职/ })).toBeEnabled();
      expect(lifecycle.resignUser).toHaveBeenCalledExactlyOnceWith("zhangsan");

      await confirmResignation(user);
      expect(await screen.findByText("已处于离职状态，无需修改")).toBeInTheDocument();
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
      expect(lifecycle.getUser).toHaveBeenCalledTimes(3);
      expect(lifecycle.resignUser.mock.calls).toEqual([["zhangsan"], ["zhangsan"]]);
      expect(screen.getByRole("button", { name: /离\s*职/ })).toBeEnabled();
    });

    it("does not classify an ordinary rejection as a committed result", async () => {
      lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Enable, true, fullAdminActions));
      lifecycle.resignUser.mockRejectedValue(new Error("离职资格已变化"));
      const onChanged = await submitResignation();
      expect(await screen.findByText("离职资格已变化")).toBeInTheDocument();
      expect(screen.queryByText(/操作已生效，但后续处理失败/)).not.toBeInTheDocument();
      expect(screen.queryByText("离职已完成")).not.toBeInTheDocument();
      expect(lifecycle.getUser).toHaveBeenCalledTimes(1);
      expect(onChanged).not.toHaveBeenCalled();
      expect(lifecycle.resignUser).toHaveBeenCalledTimes(1);
    });

    // The handler is shared; retain one HR case with only resignation granted to verify access wiring.
    it.each([
      { role: "Full Admin", refreshFails: false },
      { role: "Full Admin", refreshFails: true },
      { role: "HR", refreshFails: false },
    ] as const)(
      "$role retains the committed warning when refresh fails=$refreshFails without replay",
      async ({ role, refreshFails }) => {
        const actions = role === "HR" ? hrActions : fullAdminActions;
        lifecycle.getUser.mockResolvedValueOnce(detail(EmploymentStatus.Enable, true, actions));
        if (refreshFails) lifecycle.getUser.mockRejectedValue(new Error("详情暂不可用"));
        else
          lifecycle.getUser.mockResolvedValue({
            ...detail(EmploymentStatus.Disable, false, actions),
            name: "已刷新用户",
            status: UserStatus.Disable,
          });
        lifecycle.resignUser.mockRejectedValue(new AdminMutationCommittedError(null));
        const onChanged = await submitResignation(role);
        expect(await screen.findByText(refreshFails ? "详情暂不可用" : "已刷新用户")).toBeInTheDocument();
        expect(screen.getByText(/操作已生效，但后续处理失败/).closest("[role=alert]")).toHaveTextContent(
          "联系管理员修复",
        );
        expect(screen.queryByText("离职已完成")).not.toBeInTheDocument();
        expect(lifecycle.getUser).toHaveBeenCalledTimes(2);
        expect(lifecycle.resignUser).toHaveBeenCalledExactlyOnceWith("zhangsan");
        expect(onChanged).toHaveBeenCalledTimes(refreshFails ? 0 : 1);
      },
    );
  });

  it("keeps ordinary status rejection separate from committed recovery", async () => {
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Enable));
    lifecycle.updateUserStatus.mockRejectedValue(new Error("无权修改该用户状态"));
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />,
    );
    await user.click(await screen.findByRole("button", { name: /状\s*态/ }));
    await user.click(await screen.findByText("切为「暂停」"));
    expect(await screen.findByText("无权修改该用户状态")).toBeInTheDocument();
    expect(screen.queryByText(/操作已生效，但后续处理失败/)).not.toBeInTheDocument();
    expect(lifecycle.getUser).toHaveBeenCalledTimes(1);
    expect(lifecycle.updateUserStatus).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])("shows the actual status outcome (changed=%s)", async (changed) => {
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Enable));
    lifecycle.updateUserStatus.mockResolvedValue({ changed, result: null });
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />,
    );
    await user.click(await screen.findByRole("button", { name: /状\s*态/ }));
    expect(await screen.findByText("切为「暂停」")).toBeInTheDocument();
    expect(screen.getByText("切为「停用」")).toBeInTheDocument();
    expect(screen.queryByText("切为「启用」")).not.toBeInTheDocument();
    await user.click(await screen.findByText("切为「暂停」"));
    expect(await screen.findByText(changed ? "状态已更新" : "状态无需修改")).toBeInTheDocument();
    expect(lifecycle.updateUserStatus).toHaveBeenCalledExactlyOnceWith("zhangsan", UserStatus.Pause);
    await waitFor(() => expect(lifecycle.getUser).toHaveBeenCalledTimes(2));
  });

  it("refreshes committed status facts while keeping the repair warning and never replaying", async () => {
    lifecycle.getUser.mockResolvedValueOnce(detail(EmploymentStatus.Enable)).mockResolvedValue({
      ...detail(EmploymentStatus.Enable),
      name: "已刷新用户",
      status: UserStatus.Pause,
    });
    lifecycle.updateUserStatus.mockRejectedValue(new AdminMutationCommittedError(null));
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />,
    );
    await user.click(await screen.findByRole("button", { name: /状\s*态/ }));
    await user.click(await screen.findByText("切为「暂停」"));
    expect(await screen.findByText("已刷新用户")).toBeInTheDocument();
    expect(screen.getByText(/操作已生效，但后续处理失败/).closest("[role=alert]")).toHaveTextContent("后续处理失败");
    expect(lifecycle.updateUserStatus).toHaveBeenCalledTimes(1);
    expect(lifecycle.getUser).toHaveBeenCalledTimes(2);
  });

  it("shows the delegation deletion blocker and keeps the detail open without retrying", async () => {
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Disable));
    lifecycle.deleteUser.mockRejectedValue(new Error("该用户存在未结束的委托，无法删除；请先结束相关委托"));
    const onClose = vi.fn();
    const onChanged = vi.fn();
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={onClose} onEdit={vi.fn()} onChanged={onChanged} />,
    );
    await user.click(await screen.findByRole("button", { name: /删\s*除/ }));
    const titles = await screen.findAllByText("删除用户 张三？");
    const dialog = titles.find((title) => title.classList.contains("ant-modal-confirm-title"))?.closest(".ant-modal");
    expect(dialog).not.toBeNull();
    await user.click(within(dialog as HTMLElement).getByRole("button", { name: /确\s*定/ }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(await screen.findByText(/存在未结束的委托，无法删除/)).toBeInTheDocument();
    expect(screen.queryByText("已删除")).not.toBeInTheDocument();
    expect(screen.queryByText(/操作已生效，但后续处理失败/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /删\s*除/ })).toBeEnabled();
    expect(lifecycle.deleteUser).toHaveBeenCalledExactlyOnceWith("zhangsan");
    expect(lifecycle.getUser).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("refreshes after a committed delete, removes stale actions and retains the repair warning on missing detail", async () => {
    lifecycle.getUser
      .mockResolvedValueOnce(detail(EmploymentStatus.Disable))
      .mockRejectedValue(new Error("用户不存在"));
    lifecycle.deleteUser.mockRejectedValue(new AdminMutationCommittedError(null));
    const onClose = vi.fn();
    const onChanged = vi.fn();
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={onClose} onEdit={vi.fn()} onChanged={onChanged} />,
    );
    await user.click(await screen.findByRole("button", { name: /删\s*除/ }));
    const titles = await screen.findAllByText("删除用户 张三？");
    const dialog = titles.find((title) => title.classList.contains("ant-modal-confirm-title"))?.closest(".ant-modal");
    expect(dialog).not.toBeNull();
    await user.click(within(dialog as HTMLElement).getByRole("button", { name: /确\s*定/ }));
    await waitFor(() => expect(lifecycle.getUser).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/操作已生效，但后续处理失败/).closest("[role=alert]")).toHaveTextContent("删除已生效");
    expect(screen.getByText(/操作已生效，但后续处理失败/).closest("[role=alert]")).toHaveTextContent("联系管理员修复");
    expect(screen.queryByRole("button", { name: /删\s*除/ })).not.toBeInTheDocument();
    expect(lifecycle.deleteUser).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps an HR User detail informative while every unavailable action stays inert", async () => {
    __setAccess({
      canAccessUser: true,
      canAccessPosition: true,
      canAccessEmployment: true,
      canAccessOrganizationResponsibility: false,
      canAccessAudit: false,
      canCreateEmployment: false,
    });
    lifecycle.getUser.mockResolvedValue(
      detail(EmploymentStatus.Enable, true, {
        editProfile: denied,
        resetPassword: denied,
        changeStatus: denied,
        delete: denied,
        resign: denied,
      }),
    );
    const onEdit = vi.fn();
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={onEdit} onChanged={vi.fn()} />,
    );

    const deniedButtons = await screen.findAllByTitle("当前管理员角色未授予此操作");
    expect(deniedButtons).toHaveLength(5);
    for (const button of deniedButtons) expect(button).toBeDisabled();
    await user.click(await screen.findByRole("tab", { name: "雇佣（1）" }));
    expect(screen.queryByRole("columnheader", { name: "角色" })).not.toBeInTheDocument();
    expect(screen.queryByText("iam:hr-admin")).not.toBeInTheDocument();
    expect(screen.queryByText("+ 新增雇佣")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看任职" })).toHaveAttribute("href", "/employments?employmentId=4");
    expect(screen.queryByRole("tab", { name: "操作日志" })).not.toBeInTheDocument();
    expect(lifecycle.searchAssignments).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it.each([
    {
      action: "resetPassword",
      reason: "USER_NOT_ENABLED",
      status: UserStatus.Pause,
      buttonName: /重\s*置\s*密\s*码/,
      reasonText: "该用户当前不是启用状态",
    },
    {
      action: "changeStatus",
      reason: "USER_NOT_HR_MANAGED",
      status: UserStatus.Enable,
      buttonName: /状\s*态/,
      reasonText: "该用户当前不属于可管理人员",
    },
  ] as const)("keeps $action inert and presents its server reason $reason", async (scenario) => {
    lifecycle.getUser.mockResolvedValue({
      ...detail(EmploymentStatus.Enable, true, {
        ...fullAdminActions,
        [scenario.action]: { allowed: false, reason: scenario.reason },
      }),
      status: scenario.status,
    });
    const onChanged = vi.fn();
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={onChanged} />,
    );

    const button = await screen.findByRole("button", { name: scenario.buttonName });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", scenario.reasonText);
    expect(screen.getByRole("button", { name: /编\s*辑/ })).toBeEnabled();
    await user.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(lifecycle.confirmResetPassword).not.toHaveBeenCalled();
    expect(lifecycle.updateUserStatus).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("disables Transfer for a disabled User while retaining the other granted Employment actions", async () => {
    __setAccess({
      canAccessUser: true,
      canAccessEmployment: true,
      canAccessOrganizationResponsibility: false,
      canAccessAudit: false,
      canCreateEmployment: false,
    });
    const userDetail = detail(EmploymentStatus.Enable);
    lifecycle.getUser.mockResolvedValue({
      ...userDetail,
      status: UserStatus.Disable,
      employments: userDetail.employments.map((employment) => ({
        ...employment,
        allowedActions: {
          ...employment.allowedActions,
          transfer: { allowed: false, reason: "USER_DISABLED" },
        },
      })),
    });
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />,
    );
    await user.click(await screen.findByRole("tab", { name: "雇佣（1）" }));
    const employmentRow = await screen.findByRole("row", { name: /Developer/ });
    const transfer = within(employmentRow).getByRole("button", { name: /转\s*岗/ });
    expect(transfer).toBeDisabled();
    expect(transfer).toHaveAttribute("title", "用户已停用，不能新增任职或转岗");
    for (const name of [/暂\s*停/, /结\s*束/, "取消主岗"])
      expect(within(employmentRow).getByRole("button", { name })).toBeEnabled();
    await user.click(transfer);
    expect(screen.queryByRole("dialog", { name: "转岗任职" })).not.toBeInTheDocument();
    for (const mutation of [lifecycle.clearPrimaryEmployment, lifecycle.pauseEmployment, lifecycle.endEmployment])
      expect(mutation).not.toHaveBeenCalled();
  });

  it("runs Employment actions directly from the User detail row", async () => {
    __setAccess({
      canAccessUser: true,
      canAccessPosition: true,
      canAccessEmployment: true,
      canAccessOrganizationResponsibility: false,
      canAccessAudit: false,
      canCreateEmployment: false,
    });
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Enable));
    lifecycle.clearPrimaryEmployment.mockResolvedValue({
      changed: true,
      result: null,
    });
    lifecycle.pauseEmployment.mockResolvedValue({
      changed: true,
      result: null,
    });
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />,
    );

    const employmentTab = await screen.findByRole("tab", {
      name: "雇佣（1）",
    });
    await user.click(employmentTab);
    const employmentRow = await screen.findByRole("row", { name: /Developer/ });

    for (const action of [/转\s*岗/, "取消主岗", /暂\s*停/, /结\s*束/]) {
      const actionButton = within(employmentRow).getByRole("button", {
        name: action,
      });
      expect(actionButton).toBeEnabled();
    }

    await user.click(within(employmentRow).getByRole("button", { name: "取消主岗" }));
    const clearPrimaryTitles = await screen.findAllByText("取消 张三 的主任职？");
    const clearPrimaryDialog = clearPrimaryTitles
      .find((title) => title.classList.contains("ant-modal-confirm-title"))
      ?.closest(".ant-modal");
    expect(clearPrimaryDialog).not.toBeNull();
    await user.click(
      within(clearPrimaryDialog as HTMLElement).getByRole("button", {
        name: "取消主岗",
      }),
    );
    expect(lifecycle.clearPrimaryEmployment).toHaveBeenCalledWith(4);

    const refreshedEmploymentRow = await screen.findByRole("row", {
      name: /Developer/,
    });
    await user.click(within(refreshedEmploymentRow).getByRole("button", { name: /暂\s*停/ }));
    const pauseTitles = await screen.findAllByText("确认暂停该任职？");
    const pauseDialog = pauseTitles
      .find((title) => title.classList.contains("ant-modal-confirm-title"))
      ?.closest(".ant-modal");
    expect(pauseDialog).not.toBeNull();
    await user.click(
      within(pauseDialog as HTMLElement).getByRole("button", {
        name: "暂停任职",
      }),
    );
    expect(lifecycle.pauseEmployment).toHaveBeenCalledWith(4);

    const latestEmploymentRow = await screen.findByRole("row", {
      name: /Developer/,
    });
    await user.click(within(latestEmploymentRow).getByRole("button", { name: /转\s*岗/ }));
    expect(await screen.findByRole("dialog", { name: "转岗任职" })).toHaveTextContent("4");
  });

  it("keeps responsibility summaries grouped under their Employment row", async () => {
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Enable));
    lifecycle.searchAssignments.mockResolvedValue({
      items: [
        {
          id: 101,
          typeCode: "head",
          targetOrganization: {
            id: 2,
            orgCode: "ORG",
            orgName: "Organization",
            fullPath: [{ id: 2, orgCode: "ORG", orgName: "Organization" }],
          },
          holder: {
            employmentId: 4,
            user: { id: 1, username: "zhangsan", name: "张三" },
            organization: {
              id: 2,
              orgCode: "ORG",
              orgName: "Organization",
              fullPath: [],
            },
            position: { id: 3, posCode: "DEV", posName: "Developer" },
          },
          status: 1,
          startTime: now,
          endTime: null,
        },
      ],
      nextCursor: null,
    });
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />,
    );

    await user.click(await screen.findByRole("tab", { name: "雇佣（1）" }));
    const employmentRow = await screen.findByRole("row", { name: /Developer/ });

    expect(lifecycle.searchAssignments).toHaveBeenCalledWith({
      employmentId: 4,
      lifecycle: "open",
      limit: 20,
    });
    expect(within(employmentRow).getByText("负责人（head）")).toBeVisible();
    expect(within(employmentRow).getByRole("link", { name: "查看全部组织责任" })).toHaveAttribute(
      "href",
      "/organization-responsibilities/assignments?employment=4&lifecycle=open",
    );
  });

  it("keeps ended Employment history read-only and non-navigable", async () => {
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Disable));
    const { user } = render(
      <UserDetailDrawer open username="zhangsan" onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />,
    );

    await user.click(await screen.findByRole("tab", { name: "雇佣（1）" }));
    const employmentRow = await screen.findByRole("row", { name: /Developer/ });
    expect(within(employmentRow).queryByText("查看任职")).not.toBeInTheDocument();
    expect(lifecycle.pauseEmployment).not.toHaveBeenCalled();
    expect(lifecycle.endEmployment).not.toHaveBeenCalled();
    expect(lifecycle.clearPrimaryEmployment).not.toHaveBeenCalled();
  });
});
