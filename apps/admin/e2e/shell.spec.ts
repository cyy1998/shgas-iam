import { expect, test } from '@playwright/test';
import { mockAdminApi } from './fixtures';

test('users page opens with admin shell and user list', async ({ page }) => {
  await mockAdminApi(page);

  await page.goto('/iam-admin/users');

  await expect(page.getByText('用户管理').first()).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /用户管理/ })).toBeVisible();
  await expect(page.getByText('管理员(admin)')).toBeVisible();
  await expect(page.getByText('张三')).toBeVisible();
  await expect(page.getByText('李四')).toBeVisible();
});

test('restores a trusted callback query and hash before the admin shell renders', async ({
  page,
}) => {
  await mockAdminApi(page);
  const callbackUrl = new URL(
    '/iam-admin/users',
    'http://127.0.0.1:8001',
  );
  callbackUrl.searchParams.set('token', 'local-session');
  callbackUrl.searchParams.set(
    'state',
    'iam-first-party-navigation:v1:?tab=enabled#details',
  );

  await page.goto(callbackUrl.toString());

  await expect(page.getByText('用户管理').first()).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe('?tab=enabled');
  expect(new URL(page.url()).hash).toBe('#details');
  expect(new URL(page.url()).searchParams.has('token')).toBe(false);
});
