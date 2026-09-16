// 候选页面显式装配；后端在此替代，真实 PG/REST/tRPC 由 Admin API PostgreSQL profile 证明。
import type { ClientSsoDetail } from '@admin/services/client-sso';
import {
  ApiErrorCode,
  ClientSsoCallbackType,
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
  await expect(
    page.getByRole('button', { name: '启用 SSO', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('SSO 协议', { exact: true }).click();
  await page.getByTitle('OIDC', { exact: true }).click();
  await page
    .getByLabel('登录Redirect URIs', { exact: true })
    .fill('https://rp.example/cb');
  await page.getByLabel('登录Redirect URIs', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '保存协议及配置' }).click();
  await expect(page.getByText('已保存').last()).toBeVisible();
  await page.getByRole('button', { name: '启用 SSO', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '停用 SSO', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('SSO 协议', { exact: true }).click();
  await page.getByTitle('Custom SSO', { exact: true }).click();
  await page.getByLabel('回调类型', { exact: true }).click();
  await page.getByTitle('业务回调', { exact: true }).click();
  await page.getByLabel('回调地址').fill('https://business.example/cb');
  await page
    .getByLabel('Redirect URIs', { exact: true })
    .fill('https://business.example/*');
  await page.getByLabel('Redirect URIs', { exact: true }).press('Enter');
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
          callbackType: ClientSsoCallbackType.Business,
          callbackEndpoint: 'https://business.example/cb',
          validRedirectUrls: ['https://business.example/*'],
          subjectClaims: ['subjectIdentifier'],
        },
      },
    },
  ]);
  expect(current.ssoEnabled).toBe(true);
});

function configured(): ClientSsoDetail {
  return {
    ...initial(),
    ssoConfig: {
      protocol: ClientSsoProtocol.CustomSso,
      callbackType: ClientSsoCallbackType.Business,
      callbackEndpoint: 'https://business.example/cb',
      validRedirectUrls: ['https://business.example/*'],
      subjectClaims: ['subjectIdentifier'],
    },
  };
}

for (const outcome of ['committed', 'unknown', 'no-op'] as const) {
  test(`protocol ${outcome} refreshes actual facts without replay and preserves server actions`, async ({
    page,
  }) => {
    await mockAdminApi(page);
    let current = configured();
    let writes = 0;
    await page.route('**/rpc/admin.clientSso.detail**', (route) =>
      fulfillTrpc(route, current),
    );
    await page.route(
      '**/rpc/admin.clientSso.selectProtocol**',
      async (route) => {
        writes++;
        const { data } = parseTrpcBatchInput<{
          data: { config: ClientSsoDetail['ssoConfig'] };
        }>(route);
        if (outcome === 'no-op') {
          await fulfillTrpc(route, { changed: false, result: current });
          return;
        }
        if (outcome === 'committed')
          current = {
            ...current,
            ssoConfig: data.config,
            allowedActions: {
              ...current.allowedActions,
              selectProtocol: false,
            },
          };
        await fulfillJson(route, [
          {
            error: {
              message: 'failed',
              code: -32603,
              data: {
                code: 'INTERNAL_SERVER_ERROR',
                httpStatus: 500,
                ...(outcome === 'committed'
                  ? { serviceCode: ApiErrorCode.AdminMutationCommitted }
                  : {}),
              },
            },
          },
        ]);
      },
    );
    await page.goto('/iam-admin/clients/portal/sso');
    if (outcome !== 'no-op')
      await page.getByLabel('回调地址').fill('https://business.example/new');
    await page.getByRole('button', { name: '保存协议及配置' }).click();
    await expect(
      page.getByText(
        outcome === 'committed'
          ? /操作已提交，但缓存同步失败/
          : outcome === 'unknown'
            ? /操作未确认成功，可能已经生效/
            : '无需修改',
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: '刷新详情' }).click();
    expect(writes).toBe(1);
    if (outcome === 'committed') {
      await page.reload();
      await expect(page.getByLabel('回调地址')).toHaveValue(
        'https://business.example/new',
      );
      await expect(
        page.getByText(/刷新或读取 Secret 成功不代表传播已修复/),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: '保存协议及配置' }),
      ).toBeDisabled();
      expect(writes).toBe(1);
    }
  });
}

test('unrepaired propagation warning survives rejection, unknown result, success, no-op and reload', async ({
  page,
}) => {
  await mockAdminApi(page);
  let current = configured();
  let writes = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  await page.route('**/rpc/admin.clientSso.selectProtocol**', async (route) => {
    writes++;
    const { data } = parseTrpcBatchInput<{
      data: { config: ClientSsoDetail['ssoConfig'] };
    }>(route);
    if (writes === 1 || writes === 4)
      current = { ...current, ssoConfig: data.config };
    if (writes >= 4) {
      await fulfillTrpc(route, { changed: writes === 4, result: current });
      return;
    }
    await fulfillJson(route, [
      {
        error: {
          message: 'failed',
          code: writes === 2 ? -32600 : -32603,
          data: {
            code: writes === 2 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
            httpStatus: writes === 2 ? 400 : 500,
            ...(writes === 1
              ? { serviceCode: ApiErrorCode.AdminMutationCommitted }
              : {}),
          },
        },
      },
    ]);
  });
  await page.goto('/iam-admin/clients/portal/sso');
  const save = page.getByRole('button', { name: '保存协议及配置' });
  const repair = page.getByText(
    /旧配置或旧 Secret 可能仍生效；请联系管理员修复传播/,
  );
  await page.getByLabel('回调地址').fill('https://business.example/committed');
  await save.click();
  await expect(repair).toBeVisible();
  const persisted = await page.evaluate(() =>
    sessionStorage.getItem('client-sso-repair:portal'),
  );
  for (const feedback of [
    '操作被拒绝，请检查输入和权限后再发起操作。',
    /操作未确认成功，可能已经生效/,
    '已保存',
    '无需修改',
  ]) {
    await save.click();
    await expect(page.getByText(feedback).last()).toBeVisible();
    await expect(repair).toBeVisible();
  }
  await page.getByRole('button', { name: '刷新详情' }).click();
  await page.reload();
  await expect(repair).toBeVisible();
  const after = await page.evaluate(() =>
    sessionStorage.getItem('client-sso-repair:portal'),
  );
  expect(after).toBe(persisted);
  expect(writes).toBe(5);
});

test('protocol drafts survive refresh, block rotation and enable, and guard navigation', async ({
  page,
}) => {
  await mockAdminApi(page);
  const current = configured();
  let auxiliaryWrites = 0;
  await page.route('**/rpc/admin.clientSso.detail**', (route) =>
    fulfillTrpc(route, current),
  );
  for (const operation of ['rotateSecret', 'setEnabled']) {
    await page.route(`**/rpc/admin.clientSso.${operation}**`, (route) => {
      auxiliaryWrites++;
      return fulfillTrpc(route, { changed: true, result: current });
    });
  }
  await page.goto('/iam-admin/clients/portal/sso');
  const callback = page.getByLabel('回调地址');
  await callback.fill('https://business.example/draft');
  const rotate = page.getByRole('button', { name: '轮换 SSO Secret' });
  const enable = page.getByRole('button', { name: '启用 SSO', exact: true });
  await expect(rotate).toBeDisabled();
  await expect(enable).toBeDisabled();
  await page.getByRole('button', { name: '刷新详情' }).click();
  await expect(callback).toHaveValue('https://business.example/draft');
  await expect(rotate).toBeDisabled();
  await expect(enable).toBeDisabled();
  expect(auxiliaryWrites).toBe(0);
  await page.getByRole('menuitem', { name: /应用管理/ }).click();
  const dialog = page.getByRole('dialog', {
    name: '放弃未保存的修改？',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.getByRole('button', { name: /取\s*消/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(callback).toHaveValue('https://business.example/draft');
});
