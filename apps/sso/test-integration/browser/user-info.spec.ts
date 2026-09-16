// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode } from '@iam/contracts';
import { expect, test } from '@playwright/test';
import { currentUserInfo } from '../../test/mocks/fixtures';
import { mockSsoApi } from './fixtures';

test('portal logout uses the current entry and preserves the configured business destination', async ({
  page,
}) => {
  await mockSsoApi(page);
  await page.route('**/public/user-info', (route) =>
    route.fulfill({
      json: { code: 200, message: 'OK', data: currentUserInfo },
    }),
  );
  await page.route(
    '**/sso/.well-known/authentication-configuration',
    async (route) => {
      const origin = new URL(route.request().url()).origin;
      await route.fulfill({
        json: {
          data: {
            authorizationEndpoint: `${origin}/sso/authorize`,
            logoutEndpoint: `${origin}/sso/logout`,
          },
        },
      });
    },
  );
  await page.route('**/sso/logout?**', (route) =>
    route.fulfill({ body: '<p>Logged out</p>' }),
  );
  const redirectUrl = 'https://business.example/after-logout?keep=yes';
  await page.goto(
    `/portal/userInfo?${new URLSearchParams({ client: 'iam', redirectUrl })}`,
  );
  const origin = new URL(page.url()).origin;
  await page.locator('.topbar-user').hover();
  await page.getByText('退出登录', { exact: true }).click();
  await page.waitForURL('**/sso/logout?**');
  const logout = new URL(page.url());
  expect(logout.origin).toBe(origin);
  expect(logout.searchParams.get('redirectUrl')).toBe(redirectUrl);
  expect(logout.searchParams.get('client')).toBe('iam');
});

test('anonymous user info entry starts the SSO login flow', async ({
  page,
}) => {
  await mockSsoApi(page);
  await page.route('**/public/user-info', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        code: ApiErrorCode.Unauthorized,
        message: '未登录',
        data: null,
      },
      status: 401,
    }),
  );

  await page.goto('/portal/userInfo');

  await expect.poll(() => new URL(page.url()).pathname).toBe('/portal/login');

  const loginUrl = new URL(page.url());
  expect(loginUrl.searchParams.get('client')).toBe('iam');
  expect(loginUrl.searchParams.get('redirectUrl')).toBe(
    'http://127.0.0.1:8000/portal/userInfo',
  );
});
