// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode, SubjectClaim } from '@iam/contracts';
import { buildCustomSsoPlaceholderPreview } from '@iam/custom-sso/wire';
import { expect, test } from '@playwright/test';
import { mockSsoApi } from './fixtures';

test('user info displays the shared Custom SSO profile wire', async ({ page }) => {
  await mockSsoApi(page);
  const projection = buildCustomSsoPlaceholderPreview([
    SubjectClaim.SubjectIdentifier,
    SubjectClaim.ProfileUsername,
    SubjectClaim.ProfileName,
    SubjectClaim.ProfilePhone,
    SubjectClaim.ProfileEmployments,
  ]);
  await page.route('**/public/user-info', route =>
    route.fulfill({
      contentType: 'application/json',
      json: { code: 200, message: 'OK', data: projection },
    }),
  );

  await page.goto('/portal/userInfo');

  await expect(page.getByText('zhangsan', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('complementary').getByText('张三', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('13800000000', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '组织任职' })).toBeVisible();
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
  await expect(page.getByText('欢迎登录')).toBeVisible();
});
