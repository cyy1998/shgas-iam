// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode } from '@iam/contracts';
import { expect, test } from '@playwright/test';
import { currentUserInfo } from '../../test/mocks/fixtures';
import { mockSsoApi } from './fixtures';

test('login page opens and shows mocked password login failure', async ({
  page,
}) => {
  await mockSsoApi(page, { passwordLogin: 'failure' });

  await page.goto(
    '/portal/login?client=iam-admin&redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin',
  );

  await expect(page.getByText('欢迎登录')).toBeVisible();
  await page.getByPlaceholder('请输入您的工号').fill('zhangsan');
  await page.getByPlaceholder('请输入登录密码').fill('secret123');
  await page.getByRole('button', { name: /安全登录/ }).click();

  const dialog = page.getByRole('dialog', { name: '登录失败' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('账号或密码错误')).toBeVisible();
});

test('completes first-party authorization and restores callback query and hash', async ({
  page,
}) => {
  await mockSsoApi(page);
  let userInfoRequests = 0;
  let authorizeRequest: URL | undefined;
  await page.route('**/public/user-info', async (route) => {
    userInfoRequests += 1;
    await route.fulfill({
      contentType: 'application/json',
      json:
        userInfoRequests === 1
          ? {
              code: ApiErrorCode.Unauthorized,
              message: '未登录',
              data: null,
            }
          : {
              code: 200,
              message: 'OK',
              data: currentUserInfo,
            },
      status: userInfoRequests === 1 ? 401 : 200,
    });
  });
  await page.route('**/sso/authorize?**', async (route) => {
    authorizeRequest = new URL(route.request().url());
    const callbackUrl = new URL(
      authorizeRequest.searchParams.get('redirectUrl')!,
    );
    callbackUrl.searchParams.set('token', 'local-session');
    const state = authorizeRequest.searchParams.get('state');
    if (state !== null) callbackUrl.searchParams.set('state', state);
    await route.fulfill({
      status: 302,
      headers: { location: callbackUrl.toString() },
    });
  });

  await page.goto('/portal/userInfo?tab=%E5%90%AF%E7%94%A8#profile');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/portal/login');
  await page.getByPlaceholder('请输入您的工号').fill('zhangsan');
  await page.getByPlaceholder('请输入登录密码').fill('secret123');
  await page.getByRole('button', { name: /安全登录/ }).click();

  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe('/portal/userInfo');
  await expect(page.getByText('张三').first()).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).search)
    .toBe('?tab=%E5%90%AF%E7%94%A8');
  const finalUrl = new URL(page.url());
  expect(finalUrl.hash).toBe('#profile');
  expect(finalUrl.searchParams.has('token')).toBe(false);
  expect(authorizeRequest?.searchParams.get('state')).toBe(
    'iam-first-party-navigation:v1:?tab=%E5%90%AF%E7%94%A8#profile',
  );
});
