import { expect, test } from '@playwright/test';
import { mockSsoApi } from './fixtures';

test('reset password page completes mocked verification flow', async ({
  page,
}) => {
  await mockSsoApi(page);

  await page.goto('/portal/reset-password?client=iam-admin');

  await expect(page.getByText('找回密码')).toBeVisible();
  await page.getByPlaceholder('请输入用户名').fill('zhangsan');
  await page.getByRole('button', { name: '下一步' }).click();

  await expect(page.getByText('安全验证').first()).toBeVisible();
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByPlaceholder('请输入验证码').fill('123456');
  await page.getByRole('button', { name: '下一步' }).click();

  await expect(page.getByText('设置密码').first()).toBeVisible();
  await page.getByPlaceholder('请输入新密码').fill('Abc12345');
  await page.getByPlaceholder('请再次输入新密码').fill('Abc12345');
  await page.getByRole('button', { name: /确\s*定/ }).click();

  await expect(
    page.getByRole('dialog', { name: '密码重置完成' }),
  ).toBeVisible();
});
