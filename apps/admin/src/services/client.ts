import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import { ApiErrorCode } from '@iam/contracts';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { runAdminMutation } from './admin-mutation';

type AdminClientInputs = inferRouterInputs<AppRouter>['admin']['client'];
type AdminClientOutputs = inferRouterOutputs<AppRouter>['admin']['client'];

export type ClientVo = AdminClientOutputs['search']['result'][number];
export type ClientDetailVo = AdminClientOutputs['detail'];
export type ClientSearchParams = AdminClientInputs['search'];
export const ClientDetailErrorKind = {
  NotFound: 'not-found',
  RequestFailed: 'request-failed',
} as const;

export type ClientDetailErrorKindValue =
  (typeof ClientDetailErrorKind)[keyof typeof ClientDetailErrorKind];

export class ClientDetailError extends Error {
  public readonly kind: ClientDetailErrorKindValue;

  constructor(kind: ClientDetailErrorKindValue, cause?: unknown) {
    super(
      kind === ClientDetailErrorKind.NotFound
        ? '应用不存在'
        : '应用详情加载失败',
    );
    this.name = ClientDetailError.name;
    this.kind = kind;
    this.cause = cause;
  }
}

export function searchClients(params: ClientSearchParams) {
  return apiClient.admin.client.search.query(params);
}

export async function getClient(clientCode: string) {
  try {
    return await apiClient.admin.client.detail.query({ clientCode });
  } catch (error) {
    throw new ClientDetailError(
      isClientNotFoundTransportError(error)
        ? ClientDetailErrorKind.NotFound
        : ClientDetailErrorKind.RequestFailed,
      error,
    );
  }
}

export function createClient(body: AdminClientInputs['create']) {
  return runAdminMutation(() => apiClient.admin.client.create.mutate(body));
}

export function updateClient(
  clientCode: string,
  data: AdminClientInputs['update']['data'],
) {
  return runAdminMutation(() =>
    apiClient.admin.client.update.mutate({ clientCode, data }),
  );
}

export function updateClientStatus(
  clientCode: string,
  status: AdminClientInputs['updateStatus']['status'],
) {
  return runAdminMutation(() =>
    apiClient.admin.client.updateStatus.mutate({ clientCode, status }),
  );
}

export function deleteClient(clientCode: string) {
  return runAdminMutation(() =>
    apiClient.admin.client.delete.mutate({ clientCode }),
  );
}

function isClientNotFoundTransportError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false;
  const data = (
    error as {
      data?: { httpStatus?: unknown; serviceCode?: unknown };
    }
  ).data;
  return (
    data?.serviceCode === ApiErrorCode.ClientNotFound ||
    data?.httpStatus === 404
  );
}
