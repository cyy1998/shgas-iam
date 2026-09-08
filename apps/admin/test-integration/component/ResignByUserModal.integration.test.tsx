import ResignByUserModal from '@admin/pages/employments/components/ResignByUserModal';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';

const mocks = vi.hoisted(() => ({ resignUser: vi.fn(), searchUsers: vi.fn() }));
vi.mock('@admin/services/employment', () => ({ resignUser: mocks.resignUser }));
vi.mock('@admin/services/user', () => ({ searchUsers: mocks.searchUsers }));

async function submit() {
  mocks.searchUsers.mockResolvedValue({
    result: [{ username: 'zhangsan', name: '张三' }],
    total: 1,
  });
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const onCommitted = vi.fn();
  const { user } = render(
    <ResignByUserModal
      open
      onClose={onClose}
      onSuccess={onSuccess}
      onCommitted={onCommitted}
    />,
  );
  await user.type(screen.getByRole('combobox'), 'zhangsan');
  await user.click(await screen.findByTitle('张三 (zhangsan)'));
  await user.click(screen.getByRole('button', { name: '确认离职' }));
  return { onClose, onSuccess, onCommitted };
}

describe('ResignByUserModal', () => {
  it.each([true, false])('reports changed=%s', async (changed) => {
    mocks.resignUser.mockResolvedValue({ changed, result: null });
    const { onClose, onSuccess, onCommitted } = await submit();
    expect(
      await screen.findByText(
        changed ? '离职已完成' : '已处于离职状态，无需修改',
      ),
    ).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(mocks.resignUser).toHaveBeenCalledExactlyOnceWith('zhangsan');
  });

  it('hands committed failure to the owner for refresh and persistent warning', async () => {
    const error = new AdminMutationCommittedError(null);
    mocks.resignUser.mockRejectedValue(error);
    const { onClose, onSuccess, onCommitted } = await submit();
    await waitFor(() =>
      expect(onCommitted).toHaveBeenCalledExactlyOnceWith(error),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.resignUser).toHaveBeenCalledTimes(1);
  });

  it('leaves ordinary rejection available for correction', async () => {
    mocks.resignUser.mockRejectedValue(new Error('离职资格已变化'));
    const { onClose, onSuccess, onCommitted } = await submit();
    expect(await screen.findByText('离职资格已变化')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(mocks.resignUser).toHaveBeenCalledTimes(1);
  });
});
