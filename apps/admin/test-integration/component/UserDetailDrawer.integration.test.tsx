import UserDetailDrawer from '@admin/pages/users/components/UserDetailDrawer';
import {
  type AdminAuthorizationDecision,
  type AdminUserAllowedActions,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  UserStatus,
  UserType,
} from '@iam/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { CSSProperties } from 'react';
import { __setAccess } from '~admin/test/mocks/umijs-max';
import { render, screen, within } from '~admin/test/render';
import { createHrEmploymentAllowedActions } from '../../test/mocks/fixtures';

const lifecycle = vi.hoisted(() => ({
  clearPrimaryEmployment: vi.fn(),
  endEmployment: vi.fn(),
  getUser: vi.fn(),
  pauseEmployment: vi.fn(),
  resumeEmployment: vi.fn(),
  searchAssignments: vi.fn(),
  setPrimaryEmployment: vi.fn(),
}));

vi.mock('@admin/components/StatusTag', () => ({
  default: ({ status }: { status: number }) => <span>{status}</span>,
}));
vi.mock('@admin/components/AuthorizationActionButton', () => ({
  default: ({
    children,
    decision,
    onClick,
    style,
    type,
  }: {
    children: string;
    decision: AdminAuthorizationDecision;
    onClick?: () => void;
    style?: CSSProperties;
    type?: string;
  }) => (
    <button
      data-variant={type}
      disabled={!decision.allowed}
      onClick={onClick}
      style={style}
      title={
        decision.reason === 'ACTION_NOT_GRANTED'
          ? '当前管理员角色未授予此操作'
          : undefined
      }
      type="button"
    >
      {children}
    </button>
  ),
}));
vi.mock('@admin/components/audit/AuditLogTable', () => ({
  default: () => null,
}));
vi.mock('@admin/pages/employments/components/EmploymentFormModal', () => ({
  default: () => null,
}));
vi.mock('@admin/pages/employments/components/TransferModal', () => ({
  default: ({
    employment,
    open,
  }: {
    employment: { id: number } | null;
    open: boolean;
  }) =>
    open ? (
      <div aria-label="转岗任职" role="dialog">
        {employment?.id}
      </div>
    ) : null,
}));
vi.mock('@admin/pages/users/components/ResetPasswordModal', () => ({
  confirmResetPassword: vi.fn(),
}));

vi.mock('@admin/services/employment', () => ({
  clearPrimaryEmployment: lifecycle.clearPrimaryEmployment,
  endEmployment: lifecycle.endEmployment,
  pauseEmployment: lifecycle.pauseEmployment,
  resumeEmployment: lifecycle.resumeEmployment,
  setPrimaryEmployment: lifecycle.setPrimaryEmployment,
}));
vi.mock('@admin/services/user', () => ({
  deleteUser: vi.fn(),
  getUser: lifecycle.getUser,
  updateUserStatus: vi.fn(),
}));
vi.mock('@admin/services/organization-responsibility', () => ({
  searchOrganizationResponsibilityAssignments: lifecycle.searchAssignments,
}));

vi.mock('@ant-design/pro-components', () => {
  const ProDescriptions = () => null;
  return {
    default: { ProDescriptions },
    ProDescriptions,
  };
});

const now = new Date('2026-01-01T00:00:00.000Z');
const allowed = { allowed: true, reason: null } as const;
const denied = { allowed: false, reason: 'ACTION_NOT_GRANTED' } as const;
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
    orgCode: 'ORG',
    orgName: 'Organization',
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
      orgCode: 'COMPANY',
      orgName: 'Company',
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
    username: 'zhangsan',
    name: '张三',
    mobile: null,
    wxId: null,
    userType: UserType.Formal,
    orderNum: 0,
    status: UserStatus.Enable,
    isDelete: false,
    createTime: now,
    updateTime: now,
    roles: [],
    privileges: [],
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
          username: 'zhangsan',
          name: '张三',
          mobile: null,
          wxId: null,
        },
        position: { id: 3, posCode: 'DEV', posName: 'Developer' },
        organization,
        roles: ['iam:hr-admin'],
        privileges: ['people:read'],
        allowedActions: createHrEmploymentAllowedActions(
          employmentStatus,
          isPrimary,
        ),
        managementPath:
          employmentStatus === EmploymentStatus.Disable
            ? null
            : '/employments?employmentId=4',
      },
    ],
  };
}

describe('UserDetailDrawer Employment lifecycle actions', () => {
  it('keeps an HR User detail informative while every unavailable action stays inert', async () => {
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
      <UserDetailDrawer
        open
        username="zhangsan"
        onClose={vi.fn()}
        onEdit={onEdit}
        onChanged={vi.fn()}
      />,
    );

    const deniedButtons =
      await screen.findAllByTitle('当前管理员角色未授予此操作');
    expect(deniedButtons).toHaveLength(5);
    for (const button of deniedButtons) expect(button).toBeDisabled();
    await user.click(await screen.findByRole('tab', { name: '雇佣（1）' }));
    expect(
      screen.queryByRole('columnheader', { name: '角色' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: '权限' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('iam:hr-admin')).not.toBeInTheDocument();
    expect(screen.queryByText('people:read')).not.toBeInTheDocument();
    expect(screen.queryByText('+ 新增雇佣')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看任职' })).toHaveAttribute(
      'href',
      '/employments?employmentId=4',
    );
    expect(
      screen.queryByRole('tab', { name: '操作日志' }),
    ).not.toBeInTheDocument();
    expect(lifecycle.searchAssignments).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('runs Employment actions directly from the User detail row', async () => {
    __setAccess({
      canAccessUser: true,
      canAccessPosition: true,
      canAccessEmployment: true,
      canAccessOrganizationResponsibility: false,
      canAccessAudit: false,
      canCreateEmployment: false,
    });
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Enable));
    lifecycle.clearPrimaryEmployment.mockResolvedValue(true);
    lifecycle.pauseEmployment.mockResolvedValue(true);
    const { user } = render(
      <UserDetailDrawer
        open
        username="zhangsan"
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    const employmentTab = await screen.findByRole('tab', {
      name: '雇佣（1）',
    });
    await user.click(employmentTab);
    const employmentRow = await screen.findByRole('row', { name: /Developer/ });

    for (const action of [
      /转\s*岗/,
      '取消主岗',
      /暂\s*停/,
      /结\s*束/,
    ]) {
      const actionButton = within(employmentRow).getByRole('button', {
        name: action,
      });
      expect(actionButton).toBeEnabled();
      expect(actionButton).toHaveAttribute('data-variant', 'link');
      expect(actionButton.style.fontWeight).toBe('inherit');
      expect(actionButton.style.paddingInline).toBe('0px');
    }

    await user.click(
      within(employmentRow).getByRole('button', { name: '取消主岗' }),
    );
    const clearPrimaryTitles = await screen.findAllByText(
      '取消 张三 的主任职？',
    );
    const clearPrimaryDialog = clearPrimaryTitles
      .find((title) => title.classList.contains('ant-modal-confirm-title'))
      ?.closest('.ant-modal');
    expect(clearPrimaryDialog).not.toBeNull();
    await user.click(
      within(clearPrimaryDialog as HTMLElement).getByRole('button', {
        name: '取消主岗',
      }),
    );
    expect(lifecycle.clearPrimaryEmployment).toHaveBeenCalledWith(4);

    const refreshedEmploymentRow = await screen.findByRole('row', {
      name: /Developer/,
    });
    await user.click(
      within(refreshedEmploymentRow).getByRole('button', { name: /暂\s*停/ }),
    );
    const pauseTitles = await screen.findAllByText('确认暂停该任职？');
    const pauseDialog = pauseTitles
      .find((title) => title.classList.contains('ant-modal-confirm-title'))
      ?.closest('.ant-modal');
    expect(pauseDialog).not.toBeNull();
    await user.click(
      within(pauseDialog as HTMLElement).getByRole('button', {
        name: '暂停任职',
      }),
    );
    expect(lifecycle.pauseEmployment).toHaveBeenCalledWith(4);

    const latestEmploymentRow = await screen.findByRole('row', {
      name: /Developer/,
    });
    await user.click(
      within(latestEmploymentRow).getByRole('button', { name: /转\s*岗/ }),
    );
    expect(
      await screen.findByRole('dialog', { name: '转岗任职' }),
    ).toHaveTextContent('4');
  });

  it('keeps responsibility summaries grouped under their Employment row', async () => {
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Enable));
    lifecycle.searchAssignments.mockResolvedValue({
      items: [
        {
          id: 101,
          typeCode: 'head',
          targetOrganization: {
            id: 2,
            orgCode: 'ORG',
            orgName: 'Organization',
            fullPath: [{ id: 2, orgCode: 'ORG', orgName: 'Organization' }],
          },
          holder: {
            employmentId: 4,
            user: { id: 1, username: 'zhangsan', name: '张三' },
            organization: {
              id: 2,
              orgCode: 'ORG',
              orgName: 'Organization',
              fullPath: [],
            },
            position: { id: 3, posCode: 'DEV', posName: 'Developer' },
          },
          status: 1,
          startTime: now,
          endTime: null,
        },
      ],
      nextCursor: null,
    });
    const { user } = render(
      <UserDetailDrawer
        open
        username="zhangsan"
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('tab', { name: '雇佣（1）' }));
    const employmentRow = await screen.findByRole('row', { name: /Developer/ });

    expect(lifecycle.searchAssignments).toHaveBeenCalledWith({
      employmentId: 4,
      lifecycle: 'open',
      limit: 20,
    });
    expect(within(employmentRow).getByText('负责人（head）')).toBeVisible();
    expect(
      within(employmentRow).getByRole('link', { name: '查看全部组织责任' }),
    ).toHaveAttribute(
      'href',
      '/organization-responsibilities/assignments?employment=4&lifecycle=open',
    );
  });

  it('keeps ended Employment history read-only and non-navigable', async () => {
    lifecycle.getUser.mockResolvedValue(detail(EmploymentStatus.Disable));
    const { user } = render(
      <UserDetailDrawer
        open
        username="zhangsan"
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('tab', { name: '雇佣（1）' }));
    const employmentRow = await screen.findByRole('row', { name: /Developer/ });
    expect(
      within(employmentRow).queryByText('查看任职'),
    ).not.toBeInTheDocument();
    expect(lifecycle.pauseEmployment).not.toHaveBeenCalled();
    expect(lifecycle.endEmployment).not.toHaveBeenCalled();
    expect(lifecycle.clearPrimaryEmployment).not.toHaveBeenCalled();
  });
});
