import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import {
  ClientDetailError,
  ClientDetailErrorKind,
  configureClientCustomSso,
  configureClientOidc,
  createClient,
  disableClientCustomSso,
  disableClientOidc,
  enableClientCustomSso,
  enableClientOidc,
  getClient,
  removeClientCustomSso,
  removeClientOidc,
  rotateClientCustomSsoSecret,
  rotateClientOidcSecret,
  searchClients,
  updateClientStatus,
} from '@admin/services/client';
import {
  ApiErrorCode,
  ClientStatus,
  CustomSsoClientMode,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
  SubjectClaim,
} from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clientSearchQuery = vi.hoisted(() => vi.fn());
const clientDetailQuery = vi.hoisted(() => vi.fn());
const clientCreateMutate = vi.hoisted(() => vi.fn());
const clientUpdateStatusMutate = vi.hoisted(() => vi.fn());
const clientOidcConfigureMutate = vi.hoisted(() => vi.fn());
const oidcLifecycleMutations = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
  remove: vi.fn(),
  rotateSecret: vi.fn(),
}));
const clientCustomSsoConfigureMutate = vi.hoisted(() => vi.fn());
const clientCustomSsoEnableMutate = vi.hoisted(() => vi.fn());
const clientCustomSsoDisableMutate = vi.hoisted(() => vi.fn());
const clientCustomSsoRemoveMutate = vi.hoisted(() => vi.fn());
const clientCustomSsoRotateSecretMutate = vi.hoisted(() => vi.fn());

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      client: {
        search: { query: clientSearchQuery },
        detail: { query: clientDetailQuery },
        create: { mutate: clientCreateMutate },
        updateStatus: { mutate: clientUpdateStatusMutate },
        oidcConfigure: { mutate: clientOidcConfigureMutate },
        oidcEnable: { mutate: oidcLifecycleMutations.enable },
        oidcDisable: { mutate: oidcLifecycleMutations.disable },
        oidcRemove: { mutate: oidcLifecycleMutations.remove },
        oidcRotateSecret: { mutate: oidcLifecycleMutations.rotateSecret },
        customSsoConfigure: { mutate: clientCustomSsoConfigureMutate },
        customSsoEnable: { mutate: clientCustomSsoEnableMutate },
        customSsoDisable: { mutate: clientCustomSsoDisableMutate },
        customSsoRemove: { mutate: clientCustomSsoRemoveMutate },
        customSsoRotateSecret: {
          mutate: clientCustomSsoRotateSecretMutate,
        },
      },
    },
  },
}));

describe('client service wrappers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('preserves create and no-op results and normalizes committed failures', async () => {
    const created = { changed: true, result: { clientCode: 'new-client' } };
    clientCreateMutate.mockResolvedValueOnce(created);
    const result = await createClient({
      clientCode: 'new-client',
      clientName: 'New',
      clientSecret: 'secret',
      status: ClientStatus.Enable,
      extAttributes: {},
    });
    expect(result).toEqual(created);
    clientUpdateStatusMutate.mockResolvedValueOnce({
      changed: false,
      result: null,
    });
    expect(await updateClientStatus('new-client', ClientStatus.Enable)).toEqual(
      { changed: false, result: null },
    );
    clientUpdateStatusMutate.mockRejectedValueOnce({
      data: { serviceCode: ApiErrorCode.AdminMutationCommitted },
    });
    await expect(
      updateClientStatus('new-client', ClientStatus.Disable),
    ).rejects.toBeInstanceOf(AdminMutationCommittedError);
  });

  it.each([
    { command: enableClientOidc, mutate: oidcLifecycleMutations.enable },
    { command: disableClientOidc, mutate: oidcLifecycleMutations.disable },
    { command: removeClientOidc, mutate: oidcLifecycleMutations.remove },
    {
      command: rotateClientOidcSecret,
      mutate: oidcLifecycleMutations.rotateSecret,
    },
  ])(
    'preserves OIDC lifecycle results and committed failure semantics',
    async ({ command, mutate }) => {
      const response = {
        changed: false,
        result: { client: { clientCode: 'app' } },
      };
      mutate.mockResolvedValueOnce(response);
      expect(await command('app')).toEqual(response);
      expect(mutate).toHaveBeenCalledWith({ clientCode: 'app' });
      mutate.mockRejectedValueOnce({
        data: { serviceCode: ApiErrorCode.AdminMutationCommitted },
      });
      await expect(command('app')).rejects.toBeInstanceOf(
        AdminMutationCommittedError,
      );
    },
  );

  it('preserves one-time OIDC Secrets inside configure and rotation results', async () => {
    const response = {
      changed: true,
      result: { client: { clientCode: 'app' }, clientSecret: 'once' },
    };
    clientOidcConfigureMutate.mockResolvedValueOnce(response);
    oidcLifecycleMutations.rotateSecret.mockResolvedValueOnce(response);
    const input: Parameters<typeof configureClientOidc>[1] = {
      clientType: OidcClientType.Confidential,
      tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic,
      redirectUris: ['https://app.example.com/callback'],
      postLogoutRedirectUris: [],
      allowedScopes: [OidcScope.OpenId],
    };
    expect(await configureClientOidc('app', input)).toEqual(response);
    expect(await rotateClientOidcSecret('app')).toEqual(response);
  });

  it.each([
    { command: enableClientCustomSso, mutate: clientCustomSsoEnableMutate },
    { command: disableClientCustomSso, mutate: clientCustomSsoDisableMutate },
    { command: removeClientCustomSso, mutate: clientCustomSsoRemoveMutate },
    {
      command: rotateClientCustomSsoSecret,
      mutate: clientCustomSsoRotateSecretMutate,
    },
  ])(
    'preserves Custom SSO outcomes and committed failure semantics',
    async ({ command, mutate }) => {
      const response = {
        changed: false,
        result: { client: { clientCode: 'app' } },
      };
      mutate.mockResolvedValueOnce(response);
      expect(await command('app')).toEqual(response);
      mutate.mockRejectedValueOnce({
        data: { serviceCode: ApiErrorCode.AdminMutationCommitted },
      });
      await expect(command('app')).rejects.toBeInstanceOf(
        AdminMutationCommittedError,
      );
      expect(mutate).toHaveBeenCalledTimes(2);
    },
  );

  it('preserves Independent configuration and rotation one-time Secrets without replay', async () => {
    const response = {
      changed: true,
      result: { client: { clientCode: 'app' }, customSsoSecret: 'once' },
    };
    const input: Parameters<typeof configureClientCustomSso>[1] = {
      mode: CustomSsoClientMode.Independent,
      validRedirectUrls: ['https://app.example.com/callback'],
      subjectClaims: ['subjectIdentifier'],
      callbackEndpoint: 'https://app.example.com/callback',
      logoutEndpoint: 'https://app.example.com/logout',
    };
    clientCustomSsoConfigureMutate.mockResolvedValueOnce(response);
    clientCustomSsoRotateSecretMutate.mockResolvedValueOnce(response);
    expect(await configureClientCustomSso('app', input)).toEqual(response);
    expect(await rotateClientCustomSsoSecret('app')).toEqual(response);
    clientCustomSsoConfigureMutate.mockRejectedValueOnce({
      data: { serviceCode: ApiErrorCode.AdminMutationCommitted },
    });
    await expect(configureClientCustomSso('app', input)).rejects.toBeInstanceOf(
      AdminMutationCommittedError,
    );
    expect(clientCustomSsoConfigureMutate).toHaveBeenCalledTimes(2);
    expect(clientCustomSsoRotateSecretMutate).toHaveBeenCalledTimes(1);
  });

  it('passes search params to admin.client.search query', () => {
    const params = {
      pageNum: 1,
      pageSize: 20,
      conditions: {
        fuzzyConditions: { text: 'iam' },
        exactConditions: { statuses: [ClientStatus.Enable] },
      },
    };

    searchClients(params as Parameters<typeof searchClients>[0]);

    expect(clientSearchQuery).toHaveBeenCalledWith(params);
  });

  it('wraps detail, create, status and OIDC procedures', () => {
    const createBody = {
      clientCode: 'iam-admin',
      clientName: 'IAM 管理后台',
    } as Parameters<typeof createClient>[0];
    const oidcBody = {
      redirectUris: ['http://localhost:8001/iam-admin/callback'],
      postLogoutRedirectUris: ['http://localhost:8001/iam-admin'],
      allowedScopes: [OidcScope.OpenId],
    } as Parameters<typeof configureClientOidc>[1];

    getClient('iam-admin');
    createClient(createBody);
    updateClientStatus('iam-admin', ClientStatus.Disable);
    configureClientOidc('iam-admin', oidcBody);

    expect(clientDetailQuery).toHaveBeenCalledWith({
      clientCode: 'iam-admin',
    });
    expect(clientCreateMutate).toHaveBeenCalledWith(createBody);
    expect(clientUpdateStatusMutate).toHaveBeenCalledWith({
      clientCode: 'iam-admin',
      status: ClientStatus.Disable,
    });
    expect(clientOidcConfigureMutate).toHaveBeenCalledWith({
      clientCode: 'iam-admin',
      data: oidcBody,
    });
  });

  it('wraps each Custom SSO lifecycle procedure independently', () => {
    const customSsoBody = {
      mode: CustomSsoClientMode.Gateway,
      validRedirectUrls: ['https://app.example.com/callback'],
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      orcas: { enabled: false },
    } as Parameters<typeof configureClientCustomSso>[1];

    configureClientCustomSso('iam-admin', customSsoBody);
    enableClientCustomSso('iam-admin');
    disableClientCustomSso('iam-admin');
    removeClientCustomSso('iam-admin');
    rotateClientCustomSsoSecret('iam-admin');

    expect(clientCustomSsoConfigureMutate).toHaveBeenCalledWith({
      clientCode: 'iam-admin',
      data: customSsoBody,
    });
    expect(clientCustomSsoEnableMutate).toHaveBeenCalledWith({
      clientCode: 'iam-admin',
    });
    expect(clientCustomSsoDisableMutate).toHaveBeenCalledWith({
      clientCode: 'iam-admin',
    });
    expect(clientCustomSsoRemoveMutate).toHaveBeenCalledWith({
      clientCode: 'iam-admin',
    });
    expect(clientCustomSsoRotateSecretMutate).toHaveBeenCalledWith({
      clientCode: 'iam-admin',
    });
  });

  it.each([
    {
      transportError: {
        data: { serviceCode: ApiErrorCode.ClientNotFound },
      },
      expectedKind: ClientDetailErrorKind.NotFound,
    },
    {
      transportError: {
        data: { httpStatus: 404 },
      },
      expectedKind: ClientDetailErrorKind.NotFound,
    },
    {
      transportError: new Error('raw transport failure'),
      expectedKind: ClientDetailErrorKind.RequestFailed,
    },
  ])(
    'normalizes client detail transport errors as $expectedKind',
    async ({ transportError, expectedKind }) => {
      clientDetailQuery.mockRejectedValueOnce(transportError);

      const result = getClient('missing-client');

      await expect(result).rejects.toMatchObject({
        name: ClientDetailError.name,
        kind: expectedKind,
      });
      await expect(result).rejects.not.toThrow('raw transport failure');
    },
  );
});
