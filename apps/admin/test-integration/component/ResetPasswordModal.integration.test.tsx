import { confirmResetPassword } from '@admin/pages/users/components/ResetPasswordModal';
import { Modal } from 'antd';
import { afterEach, expect, it, vi } from 'vitest';
import { act, screen, userEvent } from '~admin/test/render';

const reset = vi.hoisted(() => vi.fn());
vi.mock('@admin/services/user', () => ({ resetUserPassword: reset }));
afterEach(() => {
  Modal.destroyAll();
  vi.clearAllMocks();
});

it('shows confirmed session effects separately from unknown results', async () => {
  reset.mockResolvedValue({
    changed: true,
    result: 'NewPassword',
    sessions: {
      userSessionsTerminated: 1,
      clientSessionsTerminated: 2,
      excluded: 1,
      failed: 0,
      unknown: 1,
    },
  });
  await act(async () => {
    confirmResetPassword({
      username: 'admin',
      onSuccess: async () => {},
      onCommitted: async () => {},
    });
  });
  await userEvent.click(
    await screen.findByRole('button', { name: /^重\s*置$/ }),
  );
  expect(await screen.findByText('NewPassword')).toBeInTheDocument();
  expect(
    await screen.findByText(/已终止 1 个根会话、2 个应用会话/),
  ).toBeInTheDocument();
  expect(screen.getByText(/结果未知 1 项/)).toBeInTheDocument();
  expect(reset).toHaveBeenCalledTimes(1);
});
