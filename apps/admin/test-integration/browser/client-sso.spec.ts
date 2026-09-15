// 候选页面显式装配；后端在此替代，真实 PG/REST/tRPC 由 Admin API PostgreSQL profile 证明。
import type { ClientSsoDetail } from '@admin/services/client-sso';
import {
  ApiErrorCode,
  ClientSsoProtocol,
  ClientStatus,
  OidcClientType,
  OidcScope,
} from '@iam/contracts';
import { expect, test } from '@playwright/test';
import {
  fulfillJson,
  fulfillTrpc,
  mockAdminApi,
  parseTrpcBatchInput,
} from './fixtures';

function initial(): ClientSsoDetail {
  return {
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
}

test('audited Secret read handles lost responses and audit failure without replay or clearing propagation notice', async ({
  page,
}) => {
  await mockAdminApi(page);
  const current = { ...initial(), hasSsoSecret: true };
  let rotations = 0;
  let reads = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.rotateSecret**', async (route) => {
    rotations++;
    await fulfillJson(route, [
      {
        error: {
          message: 'committed',
          code: -32603,
          data: {
            code: 'INTERNAL_SERVER_ERROR',
            httpStatus: 500,
            serviceCode: ApiErrorCode.AdminMutationCommitted,
          },
        },
      },
    ]);
  });
  await page.route('**/rpc/admin.clientSso.readSecret**', async (route) => {
    reads++;
    if (reads === 1) {
      await route.abort('connectionreset');
      return;
    }
    if (reads === 3) {
      await fulfillJson(route, [
        {
          error: {
            message: 'audit failed',
            code: -32603,
            data: {
              code: 'INTERNAL_SERVER_ERROR',
              httpStatus: 500,
              serviceCode: ApiErrorCode.AdminClientSecretReadAuditFailed,
            },
          },
        },
      ]);
      return;
    }
    await fulfillTrpc(route, {
      secret: 'CURRENT-SECRET',
      credentialId: 'credential-current',
      updatedAt: '2026-09-14T00:00:00Z',
    });
  });
  await page.goto('/iam-admin/clients/portal/sso');
  await page.getByRole('button', { name: '轮换 SSO Secret' }).click();
  const warning = page.getByText(/旧配置或旧 Secret 可能仍生效/);
  await expect(warning).toBeVisible();
  expect(reads).toBe(0);
  await page.getByRole('button', { name: '读取当前 Secret' }).click();
  await expect(
    page.getByText(/当前 Secret 未取得，可能是响应丢失或权限不足/),
  ).toBeVisible();
  expect(reads).toBe(1);
  await page.getByRole('button', { name: '读取当前 Secret' }).click();
  await expect(page.getByText('CURRENT-SECRET', { exact: true })).toBeVisible();
  await expect(warning).toBeVisible();
  const storage = await page.evaluate(() =>
    JSON.stringify([localStorage, sessionStorage]),
  );
  expect(storage).not.toContain('CURRENT-SECRET');
  await page.getByRole('button', { name: '读取当前 Secret' }).click();
  await expect(page.getByText(/读取审计未确认，未交付 Secret/)).toBeVisible();
  await expect(page.getByText('CURRENT-SECRET', { exact: true })).toHaveCount(
    0,
  );
  await expect(warning).toBeVisible();
  expect(reads).toBe(3);
  await page.getByRole('button', { name: '读取当前 Secret' }).click();
  await expect(page.getByText('CURRENT-SECRET', { exact: true })).toBeVisible();
  await page.reload();
  await expect(warning).toBeVisible();
  await expect(page.getByText('CURRENT-SECRET', { exact: true })).toHaveCount(
    0,
  );
  expect(rotations).toBe(1);
  expect(reads).toBe(4);
});

test('Secret buttons use independent server actions and unknown rotation is never replayed', async ({
  page,
}) => {
  await mockAdminApi(page);
  let current = initial();
  current.allowedActions.readSecret = false;
  let rotations = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.rotateSecret**', async (route) => {
    rotations++;
    current = {
      ...current,
      allowedActions: { ...current.allowedActions, rotateSecret: false },
    };
    await route.abort('connectionreset');
  });
  await page.goto('/iam-admin/clients/portal/sso');
  await expect(
    page.getByRole('button', { name: '读取当前 Secret' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '轮换 SSO Secret' }).click();
  await expect(page.getByText(/操作未确认成功，可能已经生效/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '轮换 SSO Secret' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '刷新详情' }).click();
  expect(rotations).toBe(1);
});
test('candidate configures, enables and directly switches single protocol without maintenance or secret operations', async ({
  page,
}) => {
  await mockAdminApi(page);
  let current = initial();
  const requests: unknown[] = [];
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.selectProtocol**', async (route) => {
    const input = parseTrpcBatchInput<{
      clientCode: string;
      data: { config: ClientSsoDetail['ssoConfig'] };
    }>(route);
    requests.push(input);
    current = { ...current, ssoConfig: input.data.config, hasSsoSecret: true };
    await fulfillTrpc(route, { changed: true, result: current });
  });
  await page.route('**/rpc/admin.clientSso.setEnabled**', async (route) => {
    const input = parseTrpcBatchInput<{ data: { enabled: boolean } }>(route);
    current = { ...current, ssoEnabled: input.data.enabled };
    await fulfillTrpc(route, { changed: true, result: current });
  });
  await page.goto('/iam-admin/clients/portal/sso');
  await expect(page.getByText(/未配置 SSO（Internal-only）/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '启用 SSO', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('SSO 协议', { exact: true }).click();
  await page.getByTitle('OIDC', { exact: true }).click();
  await page
    .getByLabel('Redirect URIs（每行一个）', { exact: true })
    .fill('https://rp.example/cb');
  await page.getByRole('button', { name: '保存协议及配置' }).click();
  await expect(page.getByText(/SSO 已配置，已停用/)).toBeVisible();
  await page.getByRole('button', { name: '启用 SSO', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '停用 SSO', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('SSO 协议', { exact: true }).click();
  await page.getByTitle('Custom SSO', { exact: true }).click();
  await page
    .getByLabel('Callback 完整地址')
    .fill('https://business.example/cb');
  await page
    .getByLabel('允许落地地址（每行一个）')
    .fill('https://business.example/*');
  await page.getByRole('button', { name: '保存协议及配置' }).click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  expect(requests).toEqual([
    {
      clientCode: 'portal',
      data: {
        config: {
          protocol: ClientSsoProtocol.Oidc,
          clientType: OidcClientType.Public,
          redirectUris: ['https://rp.example/cb'],
          postLogoutRedirectUris: [],
          allowedScopes: [OidcScope.OpenId],
        },
      },
    },
    {
      clientCode: 'portal',
      data: {
        config: {
          protocol: ClientSsoProtocol.CustomSso,
          callbackEndpoint: 'https://business.example/cb',
          validRedirectUrls: ['https://business.example/*'],
          subjectClaims: ['subjectIdentifier'],
        },
      },
    },
  ]);
  expect(current.ssoEnabled).toBe(true);
});

test('candidate consumes server actions and retains repair warning across refresh and reload without replay', async ({
  page,
}) => {
  await mockAdminApi(page);
  let current = initial();
  let mutations = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.save**', async (route) => {
    mutations += 1;
    current = {
      ...current,
      clientName: '已提交名称',
      allowedActions: {
        save: false,
        selectProtocol: false,
        setEnabled: false,
        rotateSecret: false,
        readSecret: false,
      },
    };
    await fulfillJson(route, [
      {
        error: {
          message: 'committed',
          code: -32603,
          data: {
            code: 'INTERNAL_SERVER_ERROR',
            httpStatus: 500,
            serviceCode: ApiErrorCode.AdminMutationCommitted,
          },
        },
      },
    ]);
  });
  await page.goto('/iam-admin/clients/portal/sso');
  await page.getByLabel('应用名称', { exact: true }).fill('已提交名称');
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(page.getByText(/操作已提交，但缓存同步失败/)).toBeVisible();
  await expect(page.getByLabel('应用名称', { exact: true })).toHaveValue(
    '已提交名称',
  );
  await page.getByRole('button', { name: '刷新详情' }).click();
  await expect(
    page.getByText(/刷新或读取 Secret 成功不代表传播已修复/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/刷新或读取 Secret 成功不代表传播已修复/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '保存基础信息' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '保存协议及配置' }),
  ).toBeDisabled();
  expect(mutations).toBe(1);
});

test('candidate no-op and unknown result are distinct; unknown refreshes without replay', async ({
  page,
}) => {
  await mockAdminApi(page);
  const current = initial();
  let mutations = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.save**', async (route) => {
    mutations += 1;
    if (mutations === 1)
      await fulfillTrpc(route, { changed: false, result: current });
    else
      await fulfillJson(route, [
        {
          error: {
            message: 'unknown',
            code: -32603,
            data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
          },
        },
      ]);
  });
  await page.goto('/iam-admin/clients/portal/sso');
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(page.getByText('无需修改')).toBeVisible();
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(page.getByText(/操作未确认成功，可能已经生效/)).toBeVisible();
  await page.getByRole('button', { name: '刷新详情' }).click();
  expect(mutations).toBe(2);
});

test('name-only save preserves a concurrent server status, while explicitly edited status is submitted once', async ({
  page,
}) => {
  await mockAdminApi(page);
  let current = initial();
  const requests: Array<{
    clientCode: string;
    data: Partial<ClientSsoDetail>;
  }> = [];
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.save**', async (route) => {
    const input = parseTrpcBatchInput<{
      clientCode: string;
      data: Partial<ClientSsoDetail>;
    }>(route);
    requests.push(input);
    current = { ...current, ...input.data };
    await fulfillTrpc(route, { changed: true, result: current });
  });
  await page.goto('/iam-admin/clients/portal/sso');
  await expect(page.getByLabel('应用名称', { exact: true })).toHaveValue(
    'Portal',
  );
  current = { ...current, status: ClientStatus.Maintenance };
  await page.getByLabel('应用名称', { exact: true }).fill('重命名');
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  expect(requests[0]).toEqual({
    clientCode: 'portal',
    data: { clientName: '重命名', url: null, description: null },
  });
  expect(current.status).toBe(ClientStatus.Maintenance);

  await page.getByLabel('应用状态', { exact: true }).click();
  await page.getByTitle('停用', { exact: true }).click();
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]?.data.status).toBe(ClientStatus.Disable);
  await page.getByLabel('应用名称', { exact: true }).fill('再次重命名');
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2]?.data).not.toHaveProperty('status');
  expect(current.status).toBe(ClientStatus.Disable);
});

test('unrepaired propagation warning survives subsequent rejection, unknown result, success, no-op and reload', async ({
  page,
}) => {
  await mockAdminApi(page);
  let current = initial();
  let mutations = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.save**', async (route) => {
    mutations += 1;
    const input = parseTrpcBatchInput<{ data: { clientName: string } }>(route);
    if (mutations === 1 || mutations === 4)
      current = { ...current, clientName: input.data.clientName };
    if (mutations >= 4) {
      await fulfillTrpc(route, { changed: mutations === 4, result: current });
      return;
    }
    if (mutations === 2) expect(input.data.clientName).toBe('');
    await fulfillJson(route, [
      {
        error: {
          message: mutations === 2 ? 'invalid name' : 'failed',
          code: mutations === 2 ? -32600 : -32603,
          data: {
            code: mutations === 2 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
            httpStatus: mutations === 2 ? 400 : 500,
            ...(mutations === 1
              ? { serviceCode: ApiErrorCode.AdminMutationCommitted }
              : {}),
          },
        },
      },
    ]);
  });
  await page.goto('/iam-admin/clients/portal/sso');
  await page.getByLabel('应用名称', { exact: true }).fill('已提交名称');
  await page.getByRole('button', { name: '保存基础信息' }).click();
  const repair = page.getByText(
    /旧配置或旧 Secret 可能仍生效；请联系管理员修复传播/,
  );
  await expect(repair).toBeVisible();
  const persisted = await page.evaluate(() =>
    sessionStorage.getItem('client-sso-repair:portal'),
  );

  await page.getByLabel('应用名称', { exact: true }).fill('');
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(
    page.getByText('操作被拒绝，请检查输入和权限后再发起操作。'),
  ).toBeVisible();
  await expect(repair).toBeVisible();
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(page.getByText(/操作未确认成功，可能已经生效/)).toBeVisible();
  await expect(repair).toBeVisible();
  await page.getByLabel('应用名称', { exact: true }).fill('后续保存');
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  await expect(repair).toBeVisible();
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(page.getByText('无需修改')).toBeVisible();
  await page.getByRole('button', { name: '刷新详情' }).click();
  await page.reload();
  await expect(repair).toBeVisible();
  const after = await page.evaluate(() =>
    sessionStorage.getItem('client-sso-repair:portal'),
  );
  expect(after).toBe(persisted);
  expect(mutations).toBe(5);
});

test('protocol drafts survive profile saves and refreshes while rotation and enable remain blocked', async ({
  page,
}) => {
  await mockAdminApi(page);
  let current: ClientSsoDetail = {
    ...initial(),
    ssoConfig: {
      protocol: ClientSsoProtocol.CustomSso,
      callbackEndpoint: 'https://business.example/cb',
      validRedirectUrls: ['https://business.example/*'],
      subjectClaims: ['subjectIdentifier'],
    },
  };
  let auxiliaryWrites = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.save**', (route) => {
    const { data } = parseTrpcBatchInput<{ data: { clientName: string } }>(
      route,
    );
    current = { ...current, clientName: data.clientName };
    return fulfillTrpc(route, { changed: true, result: current });
  });
  for (const operation of ['rotateSecret', 'setEnabled']) {
    await page.route(`**/rpc/admin.clientSso.${operation}**`, (route) => {
      auxiliaryWrites++;
      return fulfillTrpc(route, { changed: true, result: current });
    });
  }
  await page.goto('/iam-admin/clients/portal/sso');
  const callback = page.getByLabel('Callback 完整地址');
  await callback.fill('https://business.example/draft');
  const rotate = page.getByRole('button', { name: '轮换 SSO Secret' });
  const enable = page.getByRole('button', { name: '启用 SSO', exact: true });
  await expect(rotate).toBeDisabled();
  await expect(enable).toBeDisabled();
  await page.getByLabel('应用名称').fill('Changed profile');
  await page.getByRole('button', { name: '保存基础信息' }).click();
  await expect(
    page.getByText('Changed profile', { exact: true }),
  ).toBeVisible();
  await expect(callback).toHaveValue('https://business.example/draft');
  current = { ...current, clientName: 'Refreshed profile' };
  await page.getByRole('button', { name: '刷新详情' }).click();
  await expect(
    page.getByText('Refreshed profile', { exact: true }),
  ).toBeVisible();
  await expect(callback).toHaveValue('https://business.example/draft');
  await expect(rotate).toBeDisabled();
  await expect(enable).toBeDisabled();
  expect(auxiliaryWrites).toBe(0);
  await page.getByRole('menuitem', { name: /应用管理/ }).click();
  const discardDialog = page.getByRole('dialog', {
    name: '放弃未保存的修改？',
    exact: true,
  });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole('button', { name: /取\s*消/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(callback).toHaveValue('https://business.example/draft');
});
