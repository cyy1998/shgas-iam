import EmploymentFormModal from '@admin/pages/employments/components/EmploymentFormModal';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import { UserStatus } from '@iam/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';

const createEmployment = vi.hoisted(() => vi.fn());
const searchPositions = vi.hoisted(() => vi.fn());
const searchUsers = vi.hoisted(() => vi.fn());

vi.mock('@admin/components/OrganizationTreeSelector', () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value?: string) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={placeholder}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock('@admin/services/employment', () => ({ createEmployment }));

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      position: { search: { query: searchPositions } },
      user: { search: { query: searchUsers } },
    },
  },
}));

describe('EmploymentFormModal', () => {
  beforeEach(() => {
    createEmployment.mockReset();
    searchUsers.mockReset();
    searchPositions.mockReset();
  });
  it('keeps disabled users unselectable while allowing Enable and Pause candidates', async () => {
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'DEV', posName: 'Developer' }],
    });
    createEmployment.mockResolvedValue({ changed: true, result: { id: 10 } });
    searchUsers.mockResolvedValue({
      result: [
        { username: 'enabled', name: 'Enabled', status: UserStatus.Enable },
        { username: 'paused', name: 'Paused', status: UserStatus.Pause },
        { username: 'disabled', name: 'Disabled', status: UserStatus.Disable },
      ],
    });
    const { user } = render(
      <EmploymentFormModal
        open
        presetOrgCode="ORG"
        onCommitted={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );
    await user.type(
      screen.getByRole('combobox', { name: /用户/ }),
      'candidate',
    );
    const disabled = await screen.findByTitle(/Disabled \(disabled\)/);
    await user.click(disabled);
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByTitle('Paused (paused)'));
    await user.click(screen.getByRole('combobox', { name: '岗位' }));
    await user.click(await screen.findByTitle('Developer (DEV)'));
    await user.click(screen.getByRole('button', { name: /确 定|提交/ }));
    await waitFor(() =>
      expect(createEmployment).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'paused' }),
      ),
    );
  });

  it('blocks a preset user when its current status is Disable', async () => {
    render(
      <EmploymentFormModal
        open
        presetUsername="disabled"
        presetUserStatus={UserStatus.Disable}
        onCommitted={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /确 定|提交/ })).toBeDisabled();
    expect(createEmployment).not.toHaveBeenCalled();
  });
  it('creates an immediate employment without editable lifecycle boundaries', () => {
    render(
      <EmploymentFormModal
        open
        onCommitted={vi.fn()}
        presetUsername="zhangsan"
        presetName="张三"
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('生效时间')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('结束时间')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('状态')).not.toBeInTheDocument();
  });

  it('submits only administrator-controlled create facts', async () => {
    createEmployment.mockResolvedValue({ changed: true, result: { id: 10 } });
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'DEV', posName: 'Developer' }],
      total: 1,
    });
    const onSuccess = vi.fn();
    const { user } = render(
      <EmploymentFormModal
        open
        onCommitted={vi.fn()}
        presetUsername="zhangsan"
        presetName="张三"
        presetOrgCode="ORG"
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: '岗位' }));
    await user.click(await screen.findByTitle('Developer (DEV)'));
    await user.click(screen.getByRole('button', { name: /确 定|提交/ }));

    await waitFor(() => {
      expect(createEmployment).toHaveBeenCalledWith({
        username: 'zhangsan',
        orgCode: 'ORG',
        posCode: 'DEV',
        isPrimary: false,
        description: null,
      });
    });
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('startTime');
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('endTime');
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('status');
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('keeps a rejected stale create editable and retries only after an explicit submit', async () => {
    createEmployment
      .mockRejectedValueOnce(new Error('用户已停用，不能新增任职或转岗'))
      .mockResolvedValueOnce({ changed: true, result: { id: 10 } });
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'DEV', posName: 'Developer' }],
    });
    const onSuccess = vi.fn();
    const onCommitted = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = render(
      <EmploymentFormModal
        open
        presetUsername="zhangsan"
        presetOrgCode="ORG"
        onCommitted={onCommitted}
        onSuccess={onSuccess}
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: '岗位' }));
    await user.click(await screen.findByTitle('Developer (DEV)'));
    await user.type(screen.getByRole('textbox', { name: '备注' }), 'Preserved');
    await user.click(screen.getByRole('button', { name: /确 定|提交/ }));
    await screen.findByText('用户已停用，不能新增任职或转岗');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue(
      'Preserved',
    );
    expect(createEmployment).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /确 定|提交/ }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(createEmployment).toHaveBeenCalledTimes(2);
  });

  it('hands committed creation to the owner for refresh without replaying', async () => {
    const committedError = new AdminMutationCommittedError(null);
    createEmployment.mockRejectedValue(committedError);
    const onCommitted = vi.fn();
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'DEV', posName: 'Developer' }],
      total: 1,
    });
    const onSuccess = vi.fn();
    const { user } = render(
      <EmploymentFormModal
        open
        onCommitted={onCommitted}
        presetUsername="zhangsan"
        presetName="张三"
        presetOrgCode="ORG"
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: '岗位' }));
    await user.click(await screen.findByTitle('Developer (DEV)'));
    await user.click(screen.getByRole('button', { name: /确 定|提交/ }));

    await waitFor(() => {
      expect(createEmployment).toHaveBeenCalledWith({
        username: 'zhangsan',
        orgCode: 'ORG',
        posCode: 'DEV',
        isPrimary: false,
        description: null,
      });
    });
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('startTime');
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('endTime');
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('status');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCommitted).toHaveBeenCalledWith(committedError);
    expect(createEmployment).toHaveBeenCalledOnce();
  });
});
