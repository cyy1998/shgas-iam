import {
  ClientDetailError,
  ClientDetailErrorKind,
  configureClientCustomSso,
  configureClientOidc,
  createClient,
  disableClientCustomSso,
  enableClientCustomSso,
  getClient,
  removeClientCustomSso,
  rotateClientCustomSsoSecret,
  searchClients,
  updateClientStatus,
} from '@admin/services/client';
import {
  ApiErrorCode,
  ClientStatus,
  CustomSsoClientMode,
  OidcScope,
  SubjectClaim,
} from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clientSearchQuery = vi.hoisted(() => vi.fn());
const clientDetailQuery = vi.hoisted(() => vi.fn());
const clientCreateMutate = vi.hoisted(() => vi.fn());
const clientUpdateStatusMutate = vi.hoisted(() => vi.fn());
const clientOidcConfigureMutate = vi.hoisted(() => vi.fn());
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
      subjectClaimCatalogVersion: 1,
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
