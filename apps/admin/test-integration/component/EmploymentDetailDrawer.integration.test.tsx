import EmploymentDetailDrawer from '@admin/pages/employments/components/EmploymentDetailDrawer';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from '@iam/contracts';
import { message, Modal } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';
import { createHrEmploymentAllowedActions } from '../../test/mocks/fixtures';

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

vi.mock('@admin/services/employment', () => ({
  setPrimaryEmployment: services.setPrimaryEmployment,
  clearPrimaryEmployment: services.clearPrimaryEmployment,
  endEmployment: services.endEmployment,
  getEmployment: services.getEmployment,
  pauseEmployment: services.pauseEmployment,
  resumeEmployment: services.resumeEmployment,
  updateEmployment: services.updateEmployment,
}));
vi.mock('@admin/services/organization-responsibility', () => ({
  searchOrganizationResponsibilityAssignments: services.searchAssignments,
}));
vi.mock('@admin/components/audit/AuditLogTable', () => ({
  default: () => null,
}));
vi.mock('@admin/pages/employments/components/TransferModal', () => ({
  default: () => null,
}));
vi.mock('@ant-design/pro-components', () => {
  const ProDescriptions = () => null;
  return {
    default: { ProDescriptions },
    ProDescriptions,
  };
});

const now = new Date('2026-08-20T00:00:00.000Z');
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
    username: 'zhangsan',
    name: '张三',
    mobile: null,
    wxId: null,
  },
  position: { id: 8, posCode: 'OPS-LEAD', posName: '运营负责人' },
  organization: {
    assignedOrg: {
      id: 3,
      orgCode: 'OPS',
      orgName: '运营部',
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
  privileges: [],
  allowedActions: createHrEmploymentAllowedActions(
    EmploymentStatus.Enable,
    true,
  ),
};

const assignment = {
  id: 101,
  typeCode: OrganizationResponsibilityTypeCode.Head,
  targetOrganization: {
    id: 4,
    orgCode: 'FIN',
    orgName: '财务部',
    fullPath: [{ id: 4, orgCode: 'FIN', orgName: '财务部' }],
  },
  holder: {
    employmentId: 42,
    user: { id: 7, name: '张三', username: 'zhangsan' },
    organization: {
      id: 3,
      orgCode: 'OPS',
      orgName: '运营部',
      fullPath: [{ id: 3, orgCode: 'OPS', orgName: '运营部' }],
    },
    position: { id: 8, posCode: 'OPS-LEAD', posName: '运营负责人' },
  },
  status: OrganizationResponsibilityAssignmentStatus.Pause,
  startTime: now,
  endTime: null,
};

describe('EmploymentDetailDrawer responsibility wayfinding', () => {
  it('displays role and privilege names while preserving distinct roles with the same name', async () => {
    services.getEmployment.mockResolvedValue({
      ...employment,
      roles: ['app:admin', 'other:admin'],
      privileges: ['people:read'],
      roleNames: { 'app:admin': '管理员', 'other:admin': '管理员' },
      privilegeNames: { 'people:read': '查看人员' },
    });
    const { user } = render(
      <EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />,
    );
    await user.click(
      await screen.findByRole('tab', { name: '角色 / 权限 (2/1)' }),
    );
    expect(screen.getAllByText('管理员')).toHaveLength(2);
    expect(screen.getByText('查看人员')).toBeInTheDocument();
    expect(screen.queryByText('app:admin')).not.toBeInTheDocument();
    expect(screen.queryByText('people:read')).not.toBeInTheDocument();
  });

  it('edits description and renders only the server-granted lifecycle actions', async () => {
    services.getEmployment.mockResolvedValue(employment);
    services.updateEmployment.mockResolvedValue({
      changed: true,
      result: null,
    });
    const { user } = render(
      <EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />,
    );

    const edit = await screen.findByRole('button', { name: '编辑备注' });
    expect(edit).toBeEnabled();
    for (const action of [/暂\s*停/, /结\s*束/]) {
      expect(screen.getByRole('button', { name: action })).toBeEnabled();
    }
    for (const label of ['转岗', '取消主岗']) {
      expect(
        screen.getByRole('button', {
          name: label === '转岗' ? /转\s*岗/ : label,
        }),
      ).toBeEnabled();
    }
    await user.click(edit);
    await user.type(screen.getByRole('textbox', { name: '备注' }), 'HR note');
    await user.click(screen.getByRole('button', { name: /保\s*存/ }));

    expect(services.updateEmployment).toHaveBeenCalledWith(42, {
      description: 'HR note',
    });
  });

  it('shows the Employment open assignments and links to the global context', async () => {
    services.getEmployment.mockResolvedValue(employment);
    services.searchAssignments.mockResolvedValue({
      items: [assignment],
      nextCursor: null,
    });
    const { user } = render(
      <EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />,
    );

    await user.click(await screen.findByRole('tab', { name: '组织责任' }));

    expect(services.searchAssignments).toHaveBeenCalledWith({
      employmentId: 42,
      lifecycle: 'open',
      limit: 20,
    });
    expect((await screen.findAllByText('暂停')).length).toBeGreaterThan(0);
    expect(screen.getByText('负责人（head）')).toBeVisible();
    expect(screen.getByRole('link', { name: '查看任命 #101' })).toHaveAttribute(
      'href',
      '/organization-responsibilities/assignments?employment=42&lifecycle=open&assignment=101',
    );
  });
});

describe('Employment mutation outcomes', () => {
  afterEach(async () => {
    message.destroy();
    Modal.destroyAll();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: /^(暂停任职|结束任职)$/,
          hidden: true,
        }),
      ).not.toBeInTheDocument(),
    );
  });
  it.each(['setPrimary', 'clearPrimary'] as const)(
    'shows %s no-op and keeps refreshed facts instead of toggling the stale record',
    async (command) => {
      const isPrimary = command === 'clearPrimary';
      const current = {
        ...employment,
        isPrimary,
        allowedActions: createHrEmploymentAllowedActions(
          EmploymentStatus.Enable,
          isPrimary,
        ),
      };
      services.getEmployment.mockResolvedValue(current);
      services[`${command}Employment`].mockResolvedValue({
        changed: false,
        result: null,
      });
      const info = vi.spyOn(message, 'info');
      const confirm = vi
        .spyOn(Modal, 'confirm')
        .mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }));
      const { user } = render(
        <EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />,
      );
      await user.click(
        await screen.findByRole('button', {
          name: isPrimary ? '取消主岗' : '设主岗',
        }),
      );
      await confirm.mock.calls[0][0].onOk?.();
      await waitFor(() =>
        expect(services.getEmployment).toHaveBeenCalledTimes(2),
      );
      expect(info).toHaveBeenCalledWith('无需修改');
      expect(
        screen.getByRole('button', { name: isPrimary ? '取消主岗' : '设主岗' }),
      ).toBeVisible();
      expect(services[`${command}Employment`]).toHaveBeenCalledExactlyOnceWith(
        42,
      );
      confirm.mockRestore();
    },
  );

  it.each(['setPrimary', 'clearPrimary'] as const)(
    'refreshes after %s committed failure and keeps the repair warning',
    async (command) => {
      const isPrimary = command === 'clearPrimary';
      services.getEmployment.mockResolvedValue({
        ...employment,
        isPrimary,
        allowedActions: createHrEmploymentAllowedActions(
          EmploymentStatus.Enable,
          isPrimary,
        ),
      });
      services[`${command}Employment`].mockRejectedValue(
        new AdminMutationCommittedError(null),
      );
      const confirm = vi
        .spyOn(Modal, 'confirm')
        .mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }));
      const { user } = render(
        <EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />,
      );
      await user.click(
        await screen.findByRole('button', {
          name: isPrimary ? '取消主岗' : '设主岗',
        }),
      );
      await confirm.mock.calls[0][0].onOk?.();
      await waitFor(() =>
        expect(services.getEmployment).toHaveBeenCalledTimes(2),
      );
      expect(
        screen.getByText(
          '操作已生效，但后续处理失败，请刷新确认并联系管理员修复',
        ),
      ).toBeVisible();
      expect(services[`${command}Employment`]).toHaveBeenCalledOnce();
      confirm.mockRestore();
    },
  );

  it.each(['pause', 'resume', 'end', 'update'] as const)(
    'shows no-op for %s and reloads current facts',
    async (command) => {
      const status =
        command === 'resume' ? EmploymentStatus.Pause : EmploymentStatus.Enable;
      services.getEmployment.mockResolvedValue({
        ...employment,
        status,
        allowedActions: createHrEmploymentAllowedActions(status, true),
      });
      const mutation = services[`${command}Employment`];
      mutation.mockResolvedValue({ changed: false, result: null });
      const info = vi.spyOn(message, 'info');
      const { user } = render(
        <EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />,
      );
      await screen.findByRole('button', { name: '编辑备注' });
      if (command === 'update') {
        await user.click(screen.getByRole('button', { name: '编辑备注' }));
        await user.click(screen.getByRole('button', { name: /保\s*存/ }));
      } else if (command === 'resume') {
        await user.click(screen.getByRole('button', { name: /恢\s*复/ }));
      } else {
        await user.click(
          screen.getByRole('button', {
            name: command === 'pause' ? /^暂\s*停$/ : /^结\s*束$/,
          }),
        );
        await user.click(
          await screen.findByRole('button', {
            name: command === 'pause' ? '暂停任职' : '结束任职',
          }),
        );
      }
      await waitFor(() => expect(info).toHaveBeenCalledWith('无需修改'));
      await waitFor(() =>
        expect(services.getEmployment).toHaveBeenCalledTimes(2),
      );
      expect(mutation).toHaveBeenCalledOnce();
    },
  );

  it.each(['pause', 'resume', 'end', 'update'] as const)(
    'preserves the committed warning after %s refresh without replaying',
    async (command) => {
      const status =
        command === 'resume' ? EmploymentStatus.Pause : EmploymentStatus.Enable;
      services.getEmployment.mockResolvedValue({
        ...employment,
        status,
        allowedActions: createHrEmploymentAllowedActions(status, true),
      });
      const mutation = services[`${command}Employment`];
      mutation.mockRejectedValue(new AdminMutationCommittedError(null));
      const { user } = render(
        <EmploymentDetailDrawer open employmentId={42} onClose={vi.fn()} />,
      );
      await screen.findByRole('button', { name: '编辑备注' });
      if (command === 'update') {
        await user.click(screen.getByRole('button', { name: '编辑备注' }));
        await user.click(screen.getByRole('button', { name: /保\s*存/ }));
      } else if (command === 'resume') {
        await user.click(screen.getByRole('button', { name: /恢\s*复/ }));
      } else {
        await user.click(
          screen.getByRole('button', {
            name: command === 'pause' ? /^暂\s*停$/ : /^结\s*束$/,
          }),
        );
        await user.click(
          await screen.findByRole('button', {
            name: command === 'pause' ? '暂停任职' : '结束任职',
          }),
        );
      }
      await waitFor(() =>
        expect(services.getEmployment).toHaveBeenCalledTimes(2),
      );
      expect(
        screen.getByText(
          '操作已生效，但后续处理失败，请刷新确认并联系管理员修复',
        ),
      ).toBeVisible();
      expect(mutation).toHaveBeenCalledOnce();
    },
  );
});
