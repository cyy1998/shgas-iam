import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import {
  ClientDetailError,
  ClientDetailErrorKind,
  createClient,
  getClient,
  searchClients,
  updateClientStatus,
} from '@admin/services/client';
import { ApiErrorCode, ClientStatus } from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clientSearchQuery = vi.hoisted(() => vi.fn());
const clientDetailQuery = vi.hoisted(() => vi.fn());
const clientCreateMutate = vi.hoisted(() => vi.fn());
const clientUpdateStatusMutate = vi.hoisted(() => vi.fn());
vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      client: {
        search: { query: clientSearchQuery },
        detail: { query: clientDetailQuery },
        create: { mutate: clientCreateMutate },
        updateStatus: { mutate: clientUpdateStatusMutate },
      },
    },
  },
}));

describe('client service wrappers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the create result', async () => {
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
  });

  it('preserves a no-op status result', async () => {
    clientUpdateStatusMutate.mockResolvedValueOnce({
      changed: false,
      result: null,
    });
    expect(await updateClientStatus('new-client', ClientStatus.Enable)).toEqual(
      { changed: false, result: null },
    );
  });

  it('normalizes a committed status failure', async () => {
    clientUpdateStatusMutate.mockRejectedValueOnce({
      data: { serviceCode: ApiErrorCode.AdminMutationCommitted },
    });
    await expect(
      updateClientStatus('new-client', ClientStatus.Disable),
    ).rejects.toBeInstanceOf(AdminMutationCommittedError);
  });

  it('passes search params to admin.client.search query', async () => {
    const params = {
      pageNum: 1,
      pageSize: 20,
      conditions: {
        fuzzyConditions: { text: 'iam' },
        exactConditions: { statuses: [ClientStatus.Enable] },
      },
    };

    await searchClients(params as Parameters<typeof searchClients>[0]);

    expect(clientSearchQuery).toHaveBeenCalledWith(params);
  });

  it.each([
    {
      name: 'detail',
      call: () => getClient('iam-admin'),
      port: clientDetailQuery,
      input: { clientCode: 'iam-admin' },
    },
    {
      name: 'create',
      call: () =>
        createClient({
          clientCode: 'iam-admin',
          clientName: 'IAM 管理后台',
        } as Parameters<typeof createClient>[0]),
      port: clientCreateMutate,
      input: { clientCode: 'iam-admin', clientName: 'IAM 管理后台' },
    },
    {
      name: 'status',
      call: () => updateClientStatus('iam-admin', ClientStatus.Disable),
      port: clientUpdateStatusMutate,
      input: { clientCode: 'iam-admin', status: ClientStatus.Disable },
    },
  ])('maps $name input to its procedure', async ({ call, port, input }) => {
    await call();
    expect(port).toHaveBeenCalledWith(input);
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
