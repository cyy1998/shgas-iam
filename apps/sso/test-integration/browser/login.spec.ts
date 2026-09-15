// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode, LoginPageGuardDecision } from '@iam/contracts';
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

  await page.getByPlaceholder('请输入您的工号').fill('zhangsan');
  await page.getByPlaceholder('请输入登录密码').fill('secret123');
  await page.getByRole('button', { name: /安全登录/ }).click();

  const dialog = page.getByRole('dialog', { name: '登录失败' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('账号或密码错误')).toBeVisible();
});

test('continues an existing session without form flash and replaces login history', async ({
  page,
}) => {
  test.setTimeout(25_000);
  await mockSsoApi(page);
  const oidcReturn = 'a'.repeat(43);
  await page.addInitScript(() => {
    if (window.location.pathname !== '/portal/login') return;
    const recordLoginForm = () => {
      if (document.querySelector('input[placeholder="请输入您的工号"]')) {
        localStorage.setItem('login-form-was-mounted', 'true');
      }
    };
    new MutationObserver(recordLoginForm).observe(document, {
      childList: true,
      subtree: true,
    });
  });
  let guardRequests = 0;
  await page.route(/\/oidc\/login-guard\?/, async (route) => {
    guardRequests += 1;
    await route.fulfill({
      contentType: 'application/json',
      json: { decision: LoginPageGuardDecision.Continue },
    });
  });
  await page.route(/\/oidc\/resume\?/, async (route) => {
    await route.fulfill({
      body: '<h1>应用已接收授权</h1>',
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  });
  await page.goto('/portal/reset-password');
  await page.evaluate(() => localStorage.removeItem('login-form-was-mounted'));

  await page.goto(`/portal/login?oidcReturn=${oidcReturn}`);
  await expect.poll(() => guardRequests, { timeout: 2_000 }).toBe(1);
  await expect(page.getByText('应用已接收授权')).toBeVisible({
    timeout: 10_000,
  });
  expect(
    await page.evaluate(() => localStorage.getItem('login-form-was-mounted')),
  ).toBeNull();

  await page.evaluate(() => window.setTimeout(() => history.back(), 0));
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
    .toBe('/portal/reset-password');
});

test('keeps login hidden while unavailable and retries only after user action', async ({
  page,
}) => {
  await mockSsoApi(page, { loginGuard: 'unavailable-then-login' });

  await page.goto(
    '/portal/login?client=iam-admin&redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin',
  );

  await expect(
    page.getByText('统一身份认证服务暂时不可用，请稍后重试'),
  ).toBeVisible();
  await expect(page.getByPlaceholder('请输入您的工号')).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.getByPlaceholder('请输入您的工号')).toHaveCount(0);
  await page.getByRole('button', { name: /重\s*试/ }).click();
  await expect(page.getByPlaceholder('请输入您的工号')).toBeVisible();
});

test('distinguishes an invalid continuation from temporary unavailability', async ({
  page,
}) => {
  await mockSsoApi(page);
  await page.route(/\/sso\/login-guard\?/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: ApiErrorCode.BadRequest, data: null, message: 'invalid' },
      status: 400,
    });
  });

  await page.goto(
    '/portal/login?client=iam-admin&redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin',
  );

  await expect(
    page.getByText('登录请求已失效，请返回应用重新发起登录'),
  ).toBeVisible();
  await expect(
    page.getByText('统一身份认证服务暂时不可用，请稍后重试'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /重\s*试/ })).toHaveCount(0);
  await expect(page.getByPlaceholder('请输入您的工号')).toHaveCount(0);
});

test('continues a Custom SSO session even when the entry requested mobile binding mode', async ({
  page,
}) => {
  await mockSsoApi(page, { loginGuard: 'continue' });
  let authorizeRequest: URL | undefined;
  let guardRequest: URL | undefined;
  const ssoReturn = 'c'.repeat(43);
  await page.route(/\/sso\/login-guard\?/, async (route) => {
    guardRequest = new URL(route.request().url());
    await route.fulfill({
      json: { code: 200, data: { decision: 'continue' }, message: 'OK' },
    });
  });
  await page.route(/\/sso\/authorize\?/, async (route) => {
    authorizeRequest = new URL(route.request().url());
    await route.fulfill({
      body: '<h1>Custom SSO 已续接</h1>',
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  });

  await page.goto(
    `/portal/login?client=iam-admin&loginType=BMN&redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin&ssoReturn=${ssoReturn}&state=opaque`,
  );

  await expect(page.getByText('Custom SSO 已续接')).toBeVisible();
  expect(authorizeRequest?.searchParams.get('client')).toBe('iam-admin');
  expect(authorizeRequest?.searchParams.get('ssoReturn')).toBe(ssoReturn);
  expect(authorizeRequest?.searchParams.get('state')).toBe('opaque');
  expect(guardRequest?.searchParams.get('ssoReturn')).toBe(ssoReturn);
  await expect(page.getByText('您的账号尚未绑定手机号')).toHaveCount(0);
  await expect(page.getByPlaceholder('请输入您的工号')).toHaveCount(0);
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
  expect(authorizeRequest?.searchParams.get('state')).toBe(
    'iam-first-party-navigation:v1:?tab=%E5%90%AF%E7%94%A8#profile',
  );
});
