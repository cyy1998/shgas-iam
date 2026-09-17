// Browser Integration uses a mocked backend; this is not a full-system journey.
import { expect, test } from '@playwright/test';
import { mockSsoApi } from './fixtures';

test('reset password page completes mocked verification flow', async ({
  page,
}) => {
  await mockSsoApi(page);

  await page.goto('/portal/reset-password?client=iam-admin');

  await page.getByPlaceholder('请输入用户名').fill('zhangsan');
  const lookup = page.waitForRequest('**/open/users/zhangsan/masked-mobile*');
  await page.getByRole('button', { name: '下一步' }).click();
  await lookup;

  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByPlaceholder('请输入验证码').fill('123456');
  await page.getByRole('button', { name: '下一步' }).click();

  await page.getByPlaceholder('请输入新密码').fill('Abc12345');
  await page.getByPlaceholder('请再次输入新密码').fill('Abc12345');
  await page.getByRole('button', { name: /确\s*定/ }).click();

  await expect(
    page.getByRole('dialog', { name: '密码重置完成' }),
  ).toBeVisible();
});

test('null mobile blocks sending codes and advancing to password reset', async ({
  page,
}) => {
  await mockSsoApi(page);
  await page.route('**/open/users/*/masked-mobile**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'OK',
        data: { mobile: null },
      }),
    }),
  );
  const recoveryRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/open\/(?:code\/(?:send|verify)|password\/reset)/.test(request.url())) {
      recoveryRequests.push(request.url());
    }
  });
  await page.goto('/portal/reset-password');
  await page.getByPlaceholder('请输入用户名').fill('unknown');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(
    page.getByText('无法获取绑定手机号', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByPlaceholder('请输入验证码').fill('123456');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByPlaceholder('请输入新密码')).toHaveCount(0);
  expect(recoveryRequests).toEqual([]);
});
