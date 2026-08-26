// Browser Integration uses a mocked backend; this is not a full-system journey.
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
  await expect(page.getByRole('menuitem', { name: /组织管理/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /职位管理/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /雇佣关系/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /应用管理/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /角色管理/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /审计日志/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /系统日志/ })).toBeVisible();
});

test('a role without Admin capability is default-denied before management requests', async ({
  page,
}) => {
  let clientRequestCount = 0;
  await mockAdminApi(page, {
    capabilitySummary: {
      visibleModules: [],
      collectionActions: {
        user: { create: { allowed: false, reason: 'ACTION_NOT_GRANTED' } },
        employment: {
          create: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
        },
        organization: {
          createRoot: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
        },
        organizationResponsibility: {
          create: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
        },
        position: {
          create: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
          edit: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
          changeStatus: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
          delete: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
        },
      },
    },
  });
  await page.route('**/rpc/admin.client.search**', (route) => {
    clientRequestCount += 1;
    return route.abort();
  });

  await page.goto('/iam-admin/clients');

  await expect(page).toHaveURL(/\/iam-admin\/403$/);
  await expect(page.getByText('无访问权限')).toBeVisible();
  expect(clientRequestCount).toBe(0);
});

test('global Organization Responsibility navigation opens the read-only Type Catalog', async ({
  page,
}) => {
  await mockAdminApi(page);

  await page.goto('/iam-admin/organization-responsibilities/types');

  await expect(page.getByRole('menuitem', { name: /组织责任/ })).toBeVisible();
  await expect(page.getByText('责任类型目录').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'head' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'supervising' })).toBeVisible();
  await expect(page.getByText('single')).toBeVisible();
  await expect(page.getByText('multiple')).toBeVisible();
});

test('restores a trusted callback query and hash before the admin shell renders', async ({
  page,
}) => {
  await mockAdminApi(page);
  const callbackUrl = new URL('/iam-admin/users', 'http://127.0.0.1:8001');
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
