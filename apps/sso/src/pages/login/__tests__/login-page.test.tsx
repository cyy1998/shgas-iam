import { ApiErrorCode } from '@iam/contracts';
import { Modal } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../../../../test/render';
import { ServiceError } from '../../../utils/request';
import LoginPage from '../index';

const withHumanVerification = vi.hoisted(() => vi.fn());
const modalError = vi.spyOn(Modal, 'error').mockReturnValue({
  destroy: vi.fn(),
  update: vi.fn(),
});

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
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('请输入您的工号'), {
      target: { value: 'zhangsan' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入登录密码'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByText('安全登录').closest('button')!);

    await waitFor(() => {
      expect(modalError).toHaveBeenCalledWith({
        centered: true,
        title: '登录失败',
        content: '账号或密码错误',
        okText: '确定',
      });
    });
  });
});
