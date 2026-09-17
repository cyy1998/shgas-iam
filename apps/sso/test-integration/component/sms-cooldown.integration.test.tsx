import { ApiErrorCode } from '@iam/contracts';
import LoginPage from '@sso/pages/login';
import ResetPasswordPage from '@sso/pages/reset-password';
import UserInfoPage from '@sso/pages/user-info';
import { message } from 'antd';
import { HttpResponse, http } from 'msw';
import { expect, it, vi } from 'vitest';
import { currentUserInfo } from '~sso/test/mocks/fixtures';
import { server } from '~sso/test/mocks/server';
import { __setModel } from '~sso/test/mocks/umijs-max';
import { fireEvent, render, screen, waitFor } from '~sso/test/render';

type Page = 'login' | 'resetPassword' | 'bindPhone';

async function openPage(page: Page) {
  if (page === 'login') {
    window.history.pushState(
      {},
      '',
      '/portal/login?client=iam&redirectUrl=http%3A%2F%2Fexample.test',
    );
    const view = render(<LoginPage />);
    fireEvent.click(await screen.findByRole('tab', { name: '手机登录' }));
    fireEvent.change(screen.getByPlaceholderText('请输入手机号'), {
      target: { value: '13800000000' },
    });
    return view;
  }
  if (page === 'resetPassword') {
    window.history.pushState({}, '', '/portal/resetPassword?username=zhangsan');
    const view = render(<ResetPasswordPage />);
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    await screen.findByRole('button', { name: '获取验证码' });
    return view;
  }
  __setModel('sso', { userInfo: currentUserInfo, loadUserInfo: vi.fn() });
  const view = render(<UserInfoPage />);
  fireEvent.click(screen.getByRole('tab', { name: /绑定手机号/ }));
  fireEvent.change(screen.getByPlaceholderText('请输入手机号'), {
    target: { value: '13800000000' },
  });
  return view;
}

it.each(
  (['login', 'resetPassword', 'bindPhone'] as const).flatMap((page) => [
    { page, code: ApiErrorCode.SmsCooldown, status: 429 },
    { page, code: ApiErrorCode.SmsSendFailed, status: 500 },
  ]),
)('$page restores remaining time for $code', async ({ page, code, status }) => {
  let attempts = 0;
  server.use(
    http.post('*/open/code/send', () => {
      attempts += 1;
      return HttpResponse.json(
        { code, message: '发送失败，请稍后重试', data: null },
        {
          status,
          headers: { 'Retry-After': '37' },
        },
      );
    }),
  );
  await openPage(page);
  fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
  const waiting = await screen.findByRole('button', { name: /37/ });
  expect(waiting).toBeDisabled();
  fireEvent.click(waiting);
  expect(attempts).toBe(1);
});
it.each([
  [ApiErrorCode.SmsSendFailed, 500, '50'],
  [ApiErrorCode.SmsCooldown, 429, '25'],
] as const)(
  'login shows remaining time after %s and restores it after remount',
  async (code, status, delay) => {
    server.use(
      http.post('*/open/code/send', () =>
        HttpResponse.json(
          { code, message: '请稍后重试', data: null },
          { status, headers: { 'Retry-After': delay } },
        ),
      ),
    );
    const view = await openPage('login');
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    expect(
      await screen.findByRole('button', { name: `${delay} s` }),
    ).toBeDisabled();
    view.unmount();
    await openPage('login');
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    expect(
      await screen.findByRole('button', { name: `${delay} s` }),
    ).toBeDisabled();
  },
);

it.each([
  [ApiErrorCode.SmsUnavailable, 503],
  ['GATEWAY_LIMIT', 429],
] as const)(
  'does not invent a phone countdown for %s',
  async (code, status) => {
    const showError = vi.spyOn(message, 'error');
    server.use(
      http.post('*/open/code/send', () =>
        HttpResponse.json(
          { code, message: '暂时不可用', data: null },
          { status, headers: { 'Retry-After': '30' } },
        ),
      ),
    );
    await openPage('login');
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('暂时不可用'));
    expect(screen.getByRole('button', { name: '获取验证码' })).toBeEnabled();
    showError.mockRestore();
  },
);
