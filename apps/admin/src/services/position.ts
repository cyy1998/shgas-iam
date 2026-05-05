import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/api/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type AdminPositionInputs = inferRouterInputs<AppRouter>['admin']['position'];
type AdminPositionOutputs = inferRouterOutputs<AppRouter>['admin']['position'];
export type PositionVo = AdminPositionOutputs['search']['result'][number];
export type PositionDetailVo = AdminPositionOutputs['detail'];

export type PositionSearchParams = AdminPositionInputs['search'];

export function searchPositions(params: PositionSearchParams) {
  return apiClient.admin.position.search.query(params);
}

export function getPosition(posCode: string) {
  return apiClient.admin.position.detail.query({ posCode });
}

export function createPosition(body: AdminPositionInputs['create']) {
  return apiClient.admin.position.create.mutate(body);
}

export function updatePosition(
  posCode: string,
  data: AdminPositionInputs['update']['data'],
) {
  return apiClient.admin.position.update.mutate({ posCode, data });
}

export function updatePositionStatus(posCode: string, status: AdminPositionInputs['updateStatus']['status']) {
  return apiClient.admin.position.updateStatus.mutate({ posCode, status });
}

export function deletePosition(posCode: string) {
  return apiClient.admin.position.delete.mutate({ posCode });
}
