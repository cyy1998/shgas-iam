import { expect, test } from '@playwright/test';
import { mockAdminApi } from './fixtures';

test('clients page opens and shows create and edit modals', async ({
  page,
}) => {
  await mockAdminApi(page);

  await page.goto('/iam-admin/clients');

  await expect(page.getByText('应用管理').first()).toBeVisible();
  await expect(page.getByText('IAM 管理后台')).toBeVisible();

  await page.getByRole('button', { name: /新建应用/ }).click();
  await expect(page.getByRole('dialog').getByText('新建应用')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByText('编辑').first().click();
  await expect(page.getByRole('dialog').getByText('编辑应用')).toBeVisible();
});
