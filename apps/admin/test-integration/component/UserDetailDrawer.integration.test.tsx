import UserDetailDrawer from '@admin/pages/users/components/UserDetailDrawer';
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  UserStatus,
  UserType,
} from '@iam/contracts';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '~admin/test/render';

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
vi.mock('@admin/components/audit/AuditLogTable', () => ({
  default: () => null,
}));
vi.mock('@admin/pages/employments/components/EmploymentFormModal', () => ({
  default: () => null,
}));
vi.mock('@admin/pages/employments/components/TransferModal', () => ({
  default: () => null,
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

function detail(employmentStatus: EmploymentStatus, isPrimary = true) {
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
        roles: [],
        privileges: [],
      },
    ],
  };
}

describe('UserDetailDrawer Employment lifecycle actions', () => {
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

  it('refreshes the visible Employment state after an explicit Pause command', async () => {
    lifecycle.getUser
      .mockResolvedValueOnce(detail(EmploymentStatus.Enable))
      .mockResolvedValueOnce(detail(EmploymentStatus.Pause));
    lifecycle.pauseEmployment.mockResolvedValue(true);
    const onChanged = vi.fn();
    const { user } = render(
      <UserDetailDrawer
        open
        username="zhangsan"
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={onChanged}
      />,
    );

    await user.click(await screen.findByRole('tab', { name: '雇佣（1）' }));
    await user.click(await screen.findByText('暂停'));
    await user.click(await screen.findByRole('button', { name: '暂停任职' }));

    await waitFor(() => {
      expect(lifecycle.pauseEmployment).toHaveBeenCalledWith(4);
      expect(lifecycle.getUser).toHaveBeenCalledTimes(2);
      expect(screen.getByText('恢复')).toBeInTheDocument();
      expect(onChanged).toHaveBeenCalledOnce();
    });
  });

  it('ends an Open Employment and makes the refreshed row read-only', async () => {
    lifecycle.getUser
      .mockResolvedValueOnce(detail(EmploymentStatus.Pause))
      .mockResolvedValueOnce(detail(EmploymentStatus.Disable));
    lifecycle.endEmployment.mockResolvedValue(true);
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
    expect(screen.queryByText('删除')).not.toBeInTheDocument();
    const employmentRow = await screen.findByRole('row', { name: /Developer/ });
    await user.click(within(employmentRow).getByText('结束'));
    await user.click(await screen.findByRole('button', { name: '结束任职' }));

    await waitFor(() => {
      expect(lifecycle.endEmployment).toHaveBeenCalledWith(4);
      expect(lifecycle.getUser).toHaveBeenCalledTimes(2);
      const refreshedRow = screen.getByRole('row', { name: /Developer/ });
      expect(within(refreshedRow).queryByText('恢复')).not.toBeInTheDocument();
      expect(within(refreshedRow).queryByText('结束')).not.toBeInTheDocument();
      expect(within(refreshedRow).queryByText('转岗')).not.toBeInTheDocument();
    });
  });

  it('clears Primary explicitly and refreshes the user Employment list', async () => {
    lifecycle.getUser
      .mockResolvedValueOnce(detail(EmploymentStatus.Pause, true))
      .mockResolvedValueOnce(detail(EmploymentStatus.Pause, false));
    lifecycle.clearPrimaryEmployment.mockResolvedValue(true);
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
    await user.click(within(employmentRow).getByText('取消主岗'));
    await user.click(await screen.findByRole('button', { name: '取消主岗' }));

    await waitFor(() => {
      expect(lifecycle.clearPrimaryEmployment).toHaveBeenCalledWith(4);
      expect(lifecycle.getUser).toHaveBeenCalledTimes(2);
      const refreshedRow = screen.getByRole('row', { name: /Developer/ });
      expect(within(refreshedRow).getByText('设主岗')).toBeInTheDocument();
    });
  });
});
