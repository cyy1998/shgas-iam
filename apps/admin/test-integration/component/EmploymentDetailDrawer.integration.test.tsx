import EmploymentDetailDrawer from '@admin/pages/employments/components/EmploymentDetailDrawer';
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from '@iam/contracts';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '~admin/test/render';
import { createHrEmploymentAllowedActions } from '../../test/mocks/fixtures';

const services = vi.hoisted(() => ({
  endEmployment: vi.fn(),
  getEmployment: vi.fn(),
  pauseEmployment: vi.fn(),
  resumeEmployment: vi.fn(),
  searchAssignments: vi.fn(),
  updateEmployment: vi.fn(),
}));

vi.mock('@admin/services/employment', () => ({
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
  it('edits description and renders only the server-granted lifecycle actions', async () => {
    services.getEmployment.mockResolvedValue(employment);
    services.updateEmployment.mockResolvedValue(true);
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
    for (const action of [
      '编辑备注',
      /转\s*岗/,
      '取消主岗',
      /暂\s*停/,
      /结\s*束/,
    ]) {
      expect(
        screen.getByRole('button', { name: action }),
      ).toHaveClass('ant-btn-variant-outlined');
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
