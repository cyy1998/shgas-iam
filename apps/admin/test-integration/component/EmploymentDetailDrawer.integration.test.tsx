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

const services = vi.hoisted(() => ({
  getEmployment: vi.fn(),
  searchAssignments: vi.fn(),
}));

vi.mock('@admin/services/employment', () => ({
  getEmployment: services.getEmployment,
}));
vi.mock('@admin/services/organization-responsibility', () => ({
  searchOrganizationResponsibilityAssignments: services.searchAssignments,
}));
vi.mock('@admin/components/audit/AuditLogTable', () => ({
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
    expect(await screen.findByText('暂停')).toBeVisible();
    expect(screen.getByText('负责人（head）')).toBeVisible();
    expect(screen.getByRole('link', { name: '查看任命 #101' })).toHaveAttribute(
      'href',
      '/organization-responsibilities/assignments?employment=42&lifecycle=open&assignment=101',
    );
  });
});
