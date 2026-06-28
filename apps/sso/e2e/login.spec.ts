import { expect, test } from '@playwright/test';
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
