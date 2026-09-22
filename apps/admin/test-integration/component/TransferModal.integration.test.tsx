import TransferModal from '@admin/pages/employments/components/TransferModal';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import { EmploymentStatus } from '@iam/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';
import {
  createHrEmploymentAllowedActions,
  hrAdminEmploymentDetail,
} from '../../test/mocks/fixtures';

const transferEmployment = vi.hoisted(() => vi.fn());
const searchPositions = vi.hoisted(() => vi.fn());
vi.mock('@admin/services/employment', () => ({ transferEmployment }));
vi.mock('@admin/services/position', () => ({ searchPositions }));
vi.mock('@admin/components/OrganizationTreeSelector', () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <input
      aria-label="新任职组织"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

const assignedOrg = {
  ...hrAdminEmploymentDetail.organization.assignedOrg,
  parentId: -1,
  pathIndex: 0,
  distanceToAssignedOrg: 0,
};
const employment = {
  ...hrAdminEmploymentDetail,
  user: { ...hrAdminEmploymentDetail.user, wxId: null },
  organization: { assignedOrg, fullOrgPath: [assignedOrg], companyNodes: [] },
  status: EmploymentStatus.Pause,
  allowedActions: createHrEmploymentAllowedActions(
    EmploymentStatus.Pause,
    true,
  ),
};

async function fillDestination(user: ReturnType<typeof render>['user']) {
  await user.type(
    screen.getByRole('textbox', { name: '新任职组织' }),
    'TARGET_ORG',
  );
  await user.click(screen.getByRole('combobox', { name: '新岗位' }));
  await user.click(await screen.findByTitle('Destination (TARGET_POS)'));
}

describe('TransferModal', () => {
  beforeEach(() => {
    transferEmployment.mockReset();
    searchPositions.mockReset();
    transferEmployment.mockResolvedValue({ changed: true, result: { id: 10 } });
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'TARGET_POS', posName: 'Destination' }],
    });
  });

  it('blocks submission when the server withdraws Transfer permission', () => {
    render(
      <TransferModal
        open
        employment={{
          ...employment,
          allowedActions: {
            ...employment.allowedActions,
            transfer: { allowed: false, reason: 'USER_DISABLED' },
          },
        }}
        onOpenChange={vi.fn()}
        onCommitted={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /确 定/ })).toBeDisabled();
    expect(transferEmployment).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'requires an explicit Primary choice and submits isPrimary=%s',
    async (isPrimary) => {
      const onSuccess = vi.fn();
      const { user } = render(
        <TransferModal
          open
          employment={employment}
          onOpenChange={vi.fn()}
          onCommitted={vi.fn()}
          onSuccess={onSuccess}
        />,
      );
      await fillDestination(user);
      await user.click(screen.getByRole('button', { name: /确 定/ }));
      await screen.findAllByText('请选择新任职是否为主任职');
      expect(transferEmployment).not.toHaveBeenCalled();
      await user.click(
        screen.getByRole('radio', { name: isPrimary ? '主任职' : '非主任职' }),
      );
      await user.click(screen.getByRole('button', { name: /确 定/ }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(10));
      expect(transferEmployment).toHaveBeenCalledWith(employment.id, {
        newOrgCode: 'TARGET_ORG',
        newPosCode: 'TARGET_POS',
        isPrimary,
        description: null,
      });
    },
  );

  it('keeps a stale rejected transfer editable without reporting success or replaying', async () => {
    transferEmployment
      .mockRejectedValueOnce(new Error('用户已停用，不能新增任职或转岗'))
      .mockResolvedValueOnce({ changed: true, result: { id: 10 } });
    const onSuccess = vi.fn();
    const onCommitted = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = render(
      <TransferModal
        open
        employment={employment}
        onOpenChange={onOpenChange}
        onCommitted={onCommitted}
        onSuccess={onSuccess}
      />,
    );
    await fillDestination(user);
    await user.click(screen.getByRole('radio', { name: '非主任职' }));
    await user.click(screen.getByRole('button', { name: /确 定/ }));
    await screen.findByText('用户已停用，不能新增任职或转岗');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('textbox', { name: '新任职组织' })).toHaveValue(
      'TARGET_ORG',
    );
    expect(transferEmployment).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /确 定/ }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(10));
    expect(transferEmployment).toHaveBeenCalledTimes(2);
  });

  it('hands committed transfer to the owner without replaying or publishing a missing resource', async () => {
    const error = new AdminMutationCommittedError(null);
    transferEmployment.mockRejectedValue(error);
    const onSuccess = vi.fn();
    const onCommitted = vi.fn();
    const { user } = render(
      <TransferModal
        open
        employment={employment}
        onOpenChange={vi.fn()}
        onCommitted={onCommitted}
        onSuccess={onSuccess}
      />,
    );
    await fillDestination(user);
    await user.click(screen.getByRole('radio', { name: '非主任职' }));
    await user.click(screen.getByRole('button', { name: /确 定/ }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledWith(error));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(transferEmployment).toHaveBeenCalledOnce();
  });
});
