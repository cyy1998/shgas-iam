import TransferModal from '@admin/pages/employments/components/TransferModal';
import { EmploymentStatus } from '@iam/contracts';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';

const form = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
}));
const transferEmployment = vi.hoisted(() => vi.fn());

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {},
}));

vi.mock('@admin/components/OrganizationTreeSelector', () => ({
  default: () => null,
}));

vi.mock('@admin/services/employment', () => ({
  transferEmployment,
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
  }) => {
    if (!open) return null;
    return (
      <div>
        {children}
        <button type="button" onClick={() => void onFinish({ ...form.values })}>
          确定
        </button>
      </div>
    );
  };
  const Item = ({ label, name }: { label: string; name: string }) => (
    <button
      type="button"
      onClick={() => {
        form.values[name] = 'TARGET_ORG';
      }}
    >
      {label}
    </button>
  );
  const ProFormSelect = ({ label, name }: { label: string; name: string }) => (
    <button
      type="button"
      onClick={() => {
        form.values[name] = 'TARGET_POS';
      }}
    >
      {label}
    </button>
  );
  const ProFormRadio = {
    Group: ({
      name,
      options,
    }: {
      name: string;
      options: Array<{ label: string; value: boolean }>;
    }) => (
      <div>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => {
              form.values[name] = option.value;
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    ),
  };
  const ProFormTextArea = () => null;
  const components = {
    ModalForm,
    ProForm: { Item },
    ProFormRadio,
    ProFormSelect,
    ProFormTextArea,
  };
  return { ...components, default: components };
});

const employment = {
  id: 4,
  status: EmploymentStatus.Pause,
  isPrimary: true,
  user: { name: '张三', username: 'zhangsan' },
  position: { posName: 'Developer', posCode: 'DEV' },
  organization: {
    assignedOrg: { orgCode: 'ORG', orgName: 'Organization' },
    fullOrgPath: [],
    companyNodes: [],
  },
};

describe('TransferModal', () => {
  beforeEach(() => {
    form.values = {};
    transferEmployment.mockReset();
    transferEmployment.mockResolvedValue({ newEmploymentId: 10 });
  });

  it('requires an explicit Primary choice and transfers a Pause Employment as selected', async () => {
    const onSuccess = vi.fn();
    const { user } = render(
      <TransferModal
        open
        employment={employment as any}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByText('新任职组织'));
    await user.click(screen.getByText('新岗位'));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(transferEmployment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '非主任职' }));
    await user.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => {
      expect(transferEmployment).toHaveBeenCalledWith(4, {
        newOrgCode: 'TARGET_ORG',
        newPosCode: 'TARGET_POS',
        isPrimary: false,
        description: null,
      });
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it('can explicitly make the new Employment Primary', async () => {
    const { user } = render(
      <TransferModal
        open
        employment={employment as any}
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByText('新任职组织'));
    await user.click(screen.getByText('新岗位'));
    await user.click(screen.getByRole('button', { name: '主任职' }));
    await user.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => {
      expect(transferEmployment).toHaveBeenCalledWith(4, {
        newOrgCode: 'TARGET_ORG',
        newPosCode: 'TARGET_POS',
        isPrimary: true,
        description: null,
      });
    });
  });
});
