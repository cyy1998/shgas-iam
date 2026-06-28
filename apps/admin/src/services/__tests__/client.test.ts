import { ClientStatus, OidcScope } from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureClientOidc,
  createClient,
  getClient,
  searchClients,
  updateClientStatus,
} from '../client';

const clientSearchQuery = vi.hoisted(() => vi.fn());
const clientDetailQuery = vi.hoisted(() => vi.fn());
const clientCreateMutate = vi.hoisted(() => vi.fn());
const clientUpdateStatusMutate = vi.hoisted(() => vi.fn());
const clientOidcConfigureMutate = vi.hoisted(() => vi.fn());

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      client: {
        search: { query: clientSearchQuery },
        detail: { query: clientDetailQuery },
        create: { mutate: clientCreateMutate },
        updateStatus: { mutate: clientUpdateStatusMutate },
        oidcConfigure: { mutate: clientOidcConfigureMutate },
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
});
