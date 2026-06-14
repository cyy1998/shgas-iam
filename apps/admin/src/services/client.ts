import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type AdminClientInputs = inferRouterInputs<AppRouter>['admin']['client'];
type AdminClientOutputs = inferRouterOutputs<AppRouter>['admin']['client'];

export type ClientVo = AdminClientOutputs['search']['result'][number];
export type ClientDetailVo = AdminClientOutputs['detail'];
export type ClientSearchParams = AdminClientInputs['search'];
export type ClientOidcConfigureInput =
  AdminClientInputs['oidcConfigure']['data'];

export function searchClients(params: ClientSearchParams) {
  return apiClient.admin.client.search.query(params);
}

export function getClient(clientCode: string) {
  return apiClient.admin.client.detail.query({ clientCode });
}

export function createClient(body: AdminClientInputs['create']) {
  return apiClient.admin.client.create.mutate(body);
}

export function updateClient(
  clientCode: string,
  data: AdminClientInputs['update']['data'],
) {
  return apiClient.admin.client.update.mutate({ clientCode, data });
}

export function updateClientStatus(
  clientCode: string,
  status: AdminClientInputs['updateStatus']['status'],
) {
  return apiClient.admin.client.updateStatus.mutate({ clientCode, status });
}

export function deleteClient(clientCode: string) {
  return apiClient.admin.client.delete.mutate({ clientCode });
}

export function configureClientOidc(
  clientCode: string,
  data: ClientOidcConfigureInput,
) {
  return apiClient.admin.client.oidcConfigure.mutate({ clientCode, data });
}

export function enableClientOidc(clientCode: string) {
  return apiClient.admin.client.oidcEnable.mutate({ clientCode });
}

export function disableClientOidc(clientCode: string) {
  return apiClient.admin.client.oidcDisable.mutate({ clientCode });
}

export function removeClientOidc(clientCode: string) {
  return apiClient.admin.client.oidcRemove.mutate({ clientCode });
}

export function rotateClientOidcSecret(clientCode: string) {
  return apiClient.admin.client.oidcRotateSecret.mutate({ clientCode });
}
