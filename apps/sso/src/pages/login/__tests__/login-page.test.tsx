import { ApiErrorCode } from '@iam/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../../../../test/render';
import { ServiceError } from '../../../utils/request';
import LoginPage from '../index';

const withHumanVerification = vi.hoisted(() => vi.fn());

vi.mock('@sso/lib/human-verification', () => ({
  withHumanVerification,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    window.history.pushState(
      {},
      '',
      '/portal/login?client=iam-admin&redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin',
    );
    withHumanVerification.mockReset();
  });

  it('shows a strong failure prompt when password login is rejected', async () => {
    withHumanVerification.mockRejectedValue(
      new ServiceError('账号或密码错误', ApiErrorCode.LoginFailed),
    );
    const { user } = render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('请输入您的工号'), 'zhangsan');
    await user.type(screen.getByPlaceholderText('请输入登录密码'), 'secret');
    await user.click(screen.getByRole('button', { name: /安全登录/ }));

    await waitFor(() => {
      expect(screen.getAllByText('登录失败').length).toBeGreaterThan(0);
      expect(screen.getByText('账号或密码错误')).toBeInTheDocument();
    });
  });
});
