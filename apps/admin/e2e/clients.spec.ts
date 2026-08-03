import { expect, test } from '@playwright/test';
import {
  CustomSsoClientMode,
  CustomSsoClientState,
  OidcClientType,
  OidcTokenEndpointAuthMethod,
} from '@iam/contracts';
import {
  adminClientDetail,
  adminClientSearchResult,
} from '../test/mocks/fixtures';
import {
  fulfillJson,
  fulfillTrpc,
  mockAdminApi,
  parseTrpcBatchInput,
} from './fixtures';

test('client list has one edit entry with protocol summaries', async ({
  page,
}) => {
  await mockAdminApi(page);

  await page.goto('/iam-admin/clients');

  await expect(page.getByText('应用管理').first()).toBeVisible();
  await expect(page.getByText('IAM 管理后台')).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Custom SSO' }),
  ).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'OIDC' })).toBeVisible();
  await expect(page.getByText('Gateway').first()).toBeVisible();
  await expect(page.getByRole('link', { name: '编辑' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'OIDC' })).toHaveCount(0);

  await page.getByRole('link', { name: '编辑' }).click();
  await expect(page).toHaveURL(
    /\/iam-admin\/clients\/iam-admin\/edit\?section=basic$/,
  );
});

test('client list applies structured Custom SSO state and mode filters', async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.unroute('**/rpc/admin.client.search**');
  type ClientSearchInput = {
    conditions?: {
      exactConditions?: {
        customSsoStates?: CustomSsoClientState[];
        customSsoModes?: CustomSsoClientMode[];
      };
    };
  };
  const searchInputs: ClientSearchInput[] = [];
  await page.route('**/rpc/admin.client.search**', (route) => {
    const input = parseTrpcBatchInput<ClientSearchInput>(route);
    searchInputs.push(input);
    const exactConditions = input.conditions?.exactConditions;
    const matches =
      JSON.stringify(exactConditions?.customSsoStates) ===
        JSON.stringify([CustomSsoClientState.Disabled]) &&
      JSON.stringify(exactConditions?.customSsoModes) ===
        JSON.stringify([CustomSsoClientMode.Gateway]);
    return fulfillTrpc(
      route,
      matches ? adminClientSearchResult : { result: [], total: 0 },
    );
  });

  await page.goto('/iam-admin/clients');
  await page.getByText('展开', { exact: true }).click();
  await page.getByLabel('Custom SSO', { exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('已禁用', { exact: true })
    .click();
  await page.getByLabel('Custom SSO 模式', { exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('Gateway', { exact: true })
    .click();
  await page.getByRole('button', { name: /查\s*询/ }).click();

  await expect
    .poll(() => searchInputs.at(-1))
    .toMatchObject({
      conditions: {
        exactConditions: {
          customSsoStates: [CustomSsoClientState.Disabled],
          customSsoModes: [CustomSsoClientMode.Gateway],
        },
      },
    });
  await expect(page.getByText('IAM 管理后台', { exact: true })).toBeVisible();
  await expect(page.getByText('Gateway', { exact: true }).first()).toBeVisible();
});

test('creating a basic client opens its unified editor', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/iam-admin/clients');

  await page.getByRole('button', { name: /新建应用/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('新建应用')).toBeVisible();
  await dialog.getByLabel('应用编码').fill('portal cn');
  await dialog.getByLabel('应用名称').fill('门户');
  await dialog.getByLabel('通用应用密钥').fill('basic-secret');
  await dialog.getByRole('button', { name: '创建并编辑' }).click();

  await expect(page).toHaveURL(
    /\/iam-admin\/clients\/portal%20cn\/edit\?section=basic$/,
  );
});

test('unified editor guards dirty sections and destroys one-time Custom SSO secret', async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto('/iam-admin/clients');
  await page.getByRole('link', { name: '编辑' }).click();
  await page.getByRole('tab', { name: 'Custom SSO' }).click();

  await expect(page.getByText('IAM 管理后台', { exact: true })).toBeVisible();
  await expect(page.getByText('iam-admin', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: /Subject Identifier/ }),
  ).toBeDisabled();
  await expect(page.getByTestId('custom-sso-wire-preview')).toContainText(
    '"username": "zhangsan"',
  );
  await expect(page.getByTestId('custom-sso-wire-preview')).not.toContainText(
    '"phone"',
  );

  await page.getByRole('checkbox', { name: /手机号/ }).check();
  await expect(page.getByTestId('custom-sso-wire-preview')).toContainText(
    '"phone": "13800000000"',
  );
  const discardConfirmationTitle = page
    .locator('.ant-modal-confirm-title')
    .filter({ hasText: '放弃未保存的修改？' });

  await page.getByRole('tab', { name: 'OIDC' }).click();
  await expect(discardConfirmationTitle).toBeVisible();
  await page.getByRole('button', { name: /取\s*消/ }).click();
  await expect(discardConfirmationTitle).toBeHidden();
  await expect(page).toHaveURL(/section=custom-sso$/);

  await page.evaluate(() => window.history.back());
  await expect(discardConfirmationTitle).toBeVisible();
  await page.getByRole('button', { name: /取\s*消/ }).click();
  await expect(discardConfirmationTitle).toBeHidden();
  await expect(page).toHaveURL(/section=custom-sso$/);

  await page.evaluate(() => window.history.back());
  await expect(discardConfirmationTitle).toBeVisible();
  await page.getByRole('button', { name: '放弃修改' }).click();
  await expect(page).toHaveURL(/section=basic$/);

  await page.getByRole('tab', { name: 'Custom SSO' }).click();
  await page
    .locator('label.ant-radio-button-wrapper')
    .filter({ hasText: 'Independent' })
    .click();
  await page
    .getByLabel('Callback Endpoint')
    .fill('https://app.example.com/sso/callback');
  await page
    .getByLabel('Logout Endpoint')
    .fill('https://app.example.com/logout');
  await page.unroute('**/rpc/admin.client.detail**');
  await page.route('**/rpc/admin.client.detail**', (route) =>
    fulfillJson(route, [
      {
        error: {
          message: 'refresh failed',
          code: -32603,
          data: {
            code: 'INTERNAL_SERVER_ERROR',
            httpStatus: 500,
            path: 'admin.client.detail',
          },
        },
      },
    ]),
  );
  await page.getByRole('button', { name: '保存 Custom SSO 配置' }).click();
  await expect(
    page
      .locator('.ant-modal-confirm-title')
      .filter({ hasText: '确认切换 Custom SSO 模式？' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /确\s*定/ }).click();

  await expect(
    page.getByText('Custom SSO secret 仅显示一次').first(),
  ).toBeVisible();
  await expect(page.getByText('iam_sso_once_secret')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('iam_sso_once_secret')).toBeVisible();
  await page.getByRole('tab', { name: 'OIDC' }).click({ force: true });
  await expect(page).toHaveURL(/section=custom-sso$/);
  await expect(page.getByText('iam_sso_once_secret')).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(/section=custom-sso$/);
  await expect(page.getByText('iam_sso_once_secret')).toBeVisible();
  await page.getByRole('button', { name: '我已安全保存，关闭' }).click();
  await expect(page.getByText('iam_sso_once_secret')).toHaveCount(0);
});

test('OIDC remains editable and destroys a rotated secret only after confirmation', async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.unroute('**/rpc/admin.client.detail**');
  await page.route('**/rpc/admin.client.detail**', (route) =>
    fulfillTrpc(route, {
      ...adminClientDetail,
      oidcClientType: OidcClientType.Confidential,
      oidcConfig: {
        ...adminClientDetail.oidcConfig,
        clientType: OidcClientType.Confidential,
        tokenEndpointAuthMethod:
          OidcTokenEndpointAuthMethod.ClientSecretBasic,
      },
      hasOidcSecret: true,
    }),
  );
  await page.goto('/iam-admin/clients');
  await page.getByRole('link', { name: '编辑' }).click();
  await page.getByRole('tab', { name: 'OIDC' }).click();

  await expect(page.getByText('OIDC 配置', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('radio', {
      name: 'Confidential（PKCE + client_secret_basic）',
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: '保存 OIDC 配置' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: '轮换 secret' }),
  ).toBeEnabled();

  await page.getByRole('button', { name: '轮换 secret' }).click();
  await expect(
    page
      .locator('.ant-modal-confirm-title')
      .filter({ hasText: '轮换 OIDC secret？' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /确\s*定/ }).click();
  await expect(page.getByText('oidc_once_secret')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByText('oidc_once_secret')).toBeVisible();
  await page.locator('.ant-modal-mask').last().click({
    force: true,
    position: { x: 5, y: 5 },
  });
  await expect(page.getByText('oidc_once_secret')).toBeVisible();
  await page.getByRole('tab', { name: '基础信息' }).click({ force: true });
  await expect(page).toHaveURL(/section=oidc$/);
  await expect(page.getByText('oidc_once_secret')).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(/section=oidc$/);
  await expect(page.getByText('oidc_once_secret')).toBeVisible();

  await page.getByRole('button', { name: '我已安全保存，关闭' }).click();
  await expect(page.getByText('oidc_once_secret')).toHaveCount(0);
  await page.getByRole('tab', { name: '基础信息' }).click();
  await page.getByRole('tab', { name: 'OIDC' }).click();
  await expect(page.getByText('oidc_once_secret')).toHaveCount(0);
});

test('unknown section falls back to basic and delete returns to list', async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto('/iam-admin/clients/iam-admin/edit?section=unknown');

  await expect(page).toHaveURL(/section=basic$/);
  await expect(page.getByRole('tab', { name: '基础信息' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: '删除应用' }).click();
  await expect(
    page
      .locator('.ant-modal-confirm-title')
      .filter({ hasText: '删除应用 IAM 管理后台？' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /确\s*定/ }).click();
  await expect(page).toHaveURL(/\/iam-admin\/clients$/);
});

test('unified editor exposes loading, not-found and error states', async ({
  page,
}) => {
  await mockAdminApi(page);
  let releaseDetail!: () => void;
  const detailGate = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  await page.route('**/rpc/admin.client.detail**', async (route) => {
    await detailGate;
    await fulfillTrpc(route, adminClientDetail);
  });

  await page.goto('/iam-admin/clients/iam-admin/edit?section=basic');
  await expect(page.getByTestId('client-edit-loading')).toBeVisible();
  releaseDetail();
  await expect(page.getByRole('tab', { name: '基础信息' })).toBeVisible();

  await page.unroute('**/rpc/admin.client.detail**');
  await page.route('**/rpc/admin.client.detail**', (route) =>
    fulfillJson(route, [
      {
        error: {
          message: 'client not found',
          code: -32004,
          data: {
            code: 'NOT_FOUND',
            httpStatus: 404,
            path: 'admin.client.detail',
            serviceCode: 'CLIENT_NOT_FOUND',
          },
        },
      },
    ]),
  );
  await page.goto('/iam-admin/clients/missing/edit?section=basic');
  await expect(page.getByText('应用不存在')).toBeVisible();

  await page.unroute('**/rpc/admin.client.detail**');
  await page.route('**/rpc/admin.client.detail**', (route) =>
    fulfillJson(route, [
      {
        error: {
          message: 'internal',
          code: -32603,
          data: {
            code: 'INTERNAL_SERVER_ERROR',
            httpStatus: 500,
            path: 'admin.client.detail',
          },
        },
      },
    ]),
  );
  await page.goto('/iam-admin/clients/broken/edit?section=basic');
  await expect(page.getByText('应用详情加载失败')).toBeVisible();
});
