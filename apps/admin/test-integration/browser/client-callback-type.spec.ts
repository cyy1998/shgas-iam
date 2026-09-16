import type { ClientSsoDetail } from '@admin/services/client-sso';
import { ClientSsoProtocol, ClientStatus } from '@iam/contracts';
import { expect, test } from '@playwright/test';
import { fulfillTrpc, mockAdminApi, parseTrpcBatchInput } from './fixtures';

test('administrator chooses callback type, corrects ORCAS and reloads the saved explicit choice', async ({
  page,
}) => {
  await mockAdminApi(page);
  let current: ClientSsoDetail = {
    id: 1,
    clientCode: 'portal',
    clientName: 'Portal',
    url: null,
    description: null,
    status: ClientStatus.Enable,
    isDelete: false,
    ssoConfig: null,
    ssoEnabled: false,
    hasSsoSecret: false,
    allowedActions: {
      save: true,
      selectProtocol: true,
      setEnabled: true,
      rotateSecret: true,
      readSecret: true,
    },
  };
  let writes = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.selectProtocol**', (route) => {
    const input = parseTrpcBatchInput<{
      data: { config: ClientSsoDetail['ssoConfig'] };
    }>(route);
    writes++;
    current = { ...current, ssoConfig: input.data.config };
    return fulfillTrpc(route, { changed: true, result: current });
  });
  await page.goto('/iam-admin/clients/portal/sso');
  await page.getByLabel('SSO 协议', { exact: true }).click();
  await page.getByTitle('Custom SSO', { exact: true }).click();
  await page
    .getByLabel('Redirect URIs', { exact: true })
    .fill('https://app.test/home');
  await page.getByLabel('Redirect URIs', { exact: true }).press('Enter');
  const save = page.getByRole('button', { name: '保存协议及配置' });
  await save.click();
  await expect(page.getByText('请选择回调类型').last()).toBeVisible();
  expect(writes).toBe(0);
  await page.getByLabel('回调类型', { exact: true }).click();
  await page.getByTitle('托管回调', { exact: true }).click();
  await page.getByLabel('托管交付启用 ORCAS').check();
  await save.click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  expect(current.ssoConfig).toMatchObject({
    protocol: ClientSsoProtocol.CustomSso,
    callbackType: 'managed',
    orcas: { enabled: true },
  });
  expect(current.ssoConfig).not.toHaveProperty('callbackEndpoint');
  await page.reload();
  await expect(page.getByLabel('回调地址', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('托管交付启用 ORCAS')).toBeChecked();
  await page.getByLabel('回调类型', { exact: true }).click();
  await page.getByTitle('业务回调', { exact: true }).click();
  await page
    .getByLabel('回调地址', { exact: true })
    .fill('https://app.test/sso/callback');
  await save.click();
  await expect(
    page.getByText('业务回调不能启用 ORCAS，请先关闭 ORCAS'),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.getByLabel('托管交付启用 ORCAS').uncheck();
  await page
    .getByLabel('回调地址', { exact: true })
    .fill('https://app.test/sso/callback');
  await save.click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  expect(current.ssoConfig).toMatchObject({
    callbackType: 'business',
    callbackEndpoint: 'https://app.test/sso/callback',
  });
  await page.reload();
  await expect(page.getByLabel('回调地址', { exact: true })).toHaveValue(
    'https://app.test/sso/callback',
  );
  await expect(page.getByTitle('业务回调', { exact: true })).toBeVisible();
  expect(writes).toBe(2);
  await page.getByLabel('回调类型', { exact: true }).click();
  await page.getByTitle('托管回调', { exact: true }).click();
  await save.click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  expect(current.ssoConfig).not.toHaveProperty('callbackEndpoint');
  await page.reload();
  await page.getByLabel('回调类型', { exact: true }).click();
  await page.getByTitle('业务回调', { exact: true }).click();
  await expect(page.getByLabel('回调地址', { exact: true })).toHaveValue('');
  await save.click();
  await expect(page.getByRole('alert').last()).toBeVisible();
  expect(writes).toBe(3);
  await page
    .getByLabel('回调地址', { exact: true })
    .fill('https://app.test/new/callback');
  await save.click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  expect(current.ssoConfig).toMatchObject({
    callbackType: 'business',
    callbackEndpoint: 'https://app.test/new/callback',
  });
  expect(writes).toBe(4);
});
