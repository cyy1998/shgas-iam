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
