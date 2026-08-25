import OrgDetailPanel from '@admin/pages/organizations/components/OrgDetailPanel';
import type { OrganizationDetailVo } from '@admin/services/organization';
import {
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
} from '@iam/contracts';
import { describe, expect, it, vi } from 'vitest';
import { __setAccess } from '~admin/test/mocks/umijs-max';
import { render, screen } from '~admin/test/render';

const mutations = vi.hoisted(() => ({
  deleteOrganization: vi.fn(),
  updateOrganizationStatus: vi.fn(),
}));

vi.mock('@admin/services/organization', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteOrganization: mutations.deleteOrganization,
  updateOrganizationStatus: mutations.updateOrganizationStatus,
}));
vi.mock('@admin/components/StatusTag', () => ({
  default: ({ status }: { status: number }) => <span>{status}</span>,
}));
vi.mock(
  '@admin/pages/organizations/components/OrganizationResponsibilityAssignmentsPanel',
  () => ({ default: () => <div>责任任命内容</div> }),
);
vi.mock('@ant-design/pro-components', () => {
  const ProDescriptions = () => null;
  return { default: { ProDescriptions }, ProDescriptions };
});

const allowed = { allowed: true, reason: null } as const;

function detail(
  allowedActions: OrganizationDetailVo['allowedActions'],
): OrganizationDetailVo {
  return {
    id: 10,
    orgCode: 'ROOT-A',
    orgName: 'Root A',
    parentId: -1,
    businessParentId: -1,
    path: '/10',
    level: OrganizationLevel.One,
    orgType: OrganizationType.Company,
    orderNum: 0,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: '2026-01-01T00:00:00Z',
    updateTime: '2026-01-01T00:00:00Z',
    isLeaf: true,
    parentCode: null,
    parentName: null,
    statusText: '正常',
    childrenCount: 0,
    employmentCount: 0,
    allowedActions,
  };
}

describe('OrgDetailPanel authorization actions', () => {
  it('keeps server-denied actions disabled without issuing mutations', async () => {
    __setAccess({ canAccessOrganizationResponsibility: false });
    const onEdit = vi.fn();
    const onCreateChild = vi.fn();
    const integrityDenied = {
      allowed: false,
      reason: 'INTEGRITY_GUARD_BLOCKED',
    } as const;
    const stateDenied = {
      allowed: false,
      reason: 'RESOURCE_STATE_NOT_ACTIONABLE',
    } as const;
    const { user } = render(
      <OrgDetailPanel
        loading={false}
        detail={detail({
          createChild: stateDenied,
          edit: allowed,
          changeStatus: integrityDenied,
          delete: integrityDenied,
        })}
        childrenPage={null}
        childrenLoading={false}
        onChildrenPageChange={vi.fn()}
        onEdit={onEdit}
        onCreateChild={onCreateChild}
        onSelectChild={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '+ 下级组织' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /状\s*态/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /删\s*除/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /编\s*辑/ })).toBeEnabled();
    expect(screen.queryByText('责任任命')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ 下级组织' }));
    await user.click(screen.getByRole('button', { name: /状\s*态/ }));
    await user.click(screen.getByRole('button', { name: /删\s*除/ }));
    expect(onCreateChild).not.toHaveBeenCalled();
    expect(mutations.updateOrganizationStatus).not.toHaveBeenCalled();
    expect(mutations.deleteOrganization).not.toHaveBeenCalled();
  });

  it('explains an unmanageable responsibility blocker without exposing its record', async () => {
    __setAccess({ canAccessOrganizationResponsibility: true });
    const unmanageableDenied = {
      allowed: false,
      reason: 'UNMANAGEABLE_RESPONSIBILITY_BLOCKED',
    } as const;
    const { user } = render(
      <OrgDetailPanel
        loading={false}
        detail={detail({
          createChild: allowed,
          edit: allowed,
          changeStatus: unmanageableDenied,
          delete: unmanageableDenied,
        })}
        childrenPage={null}
        childrenLoading={false}
        onChildrenPageChange={vi.fn()}
        onEdit={vi.fn()}
        onCreateChild={vi.fn()}
        onSelectChild={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await user.hover(screen.getByRole('button', { name: /状\s*态/ }));
    expect(await screen.findByText(
      '存在当前管理员不可管理的开放责任任命，请联系完整管理员处理',
    )).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Assignment #');
    expect(document.body.textContent).not.toContain('holder');
  });
});
