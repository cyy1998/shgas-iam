import OrgFormModal from '@admin/pages/organizations/components/OrgFormModal';
import type { OrganizationDetailVo } from '@admin/services/organization';
import {
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
} from '@iam/contracts';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';

const form = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
}));
const mutations = vi.hoisted(() => ({
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
}));

vi.mock('@admin/services/organization', () => ({
  createOrganization: mutations.createOrganization,
  updateOrganization: mutations.updateOrganization,
}));

vi.mock('@ant-design/pro-components', () => {
  const ModalForm = ({
    children,
    onFinish,
    open,
  }: {
    children: ReactNode;
    onFinish: (values: Record<string, unknown>) => Promise<boolean>;
    open: boolean;
  }) =>
    open ? (
      <div>
        {children}
        <button type="button" onClick={() => void onFinish({ ...form.values })}>
          确定
        </button>
      </div>
    ) : null;
  const ProFormText = ({ label }: { label: string }) => <span>{label}</span>;
  const ProFormSelect = ({
    disabled,
    label,
  }: {
    disabled?: boolean;
    label: string;
  }) => (
    <button type="button" disabled={disabled}>
      {label}
    </button>
  );
  const components = { ModalForm, ProFormSelect, ProFormText };
  return { ...components, default: components };
});

const allowed = { allowed: true, reason: null } as const;
const integrityDenied = {
  allowed: false,
  reason: 'INTEGRITY_GUARD_BLOCKED',
} as const;

function organizationDetail(): OrganizationDetailVo {
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
    employmentCount: 1,
    allowedActions: {
      createChild: allowed,
      edit: allowed,
      changeStatus: integrityDenied,
      delete: integrityDenied,
    },
  };
}

describe('OrgFormModal authorization fields', () => {
  beforeEach(() => {
    form.values = {
      orgName: 'Renamed Root',
      orgType: OrganizationType.Department,
      status: OrganizationStatus.Disable,
    };
    mutations.updateOrganization.mockReset();
    mutations.updateOrganization.mockResolvedValue({
      changed: true,
      result: null,
    });
  });

  it('omits status from an edit when the server denies changeStatus', async () => {
    const { user } = render(
      <OrgFormModal
        open
        mode="edit"
        initialValues={organizationDetail()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '状态' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => {
      expect(mutations.updateOrganization).toHaveBeenCalledWith('ROOT-A', {
        orgName: 'Renamed Root',
        orgType: OrganizationType.Department,
      });
    });
  });
});
