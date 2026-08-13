import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type AdminEmploymentInputs =
  inferRouterInputs<AppRouter>['admin']['employment'];
type AdminEmploymentOutputs =
  inferRouterOutputs<AppRouter>['admin']['employment'];
export type EmploymentVo = AdminEmploymentOutputs['search']['result'][number];
export type EmploymentDetailVo = AdminEmploymentOutputs['detail'];

export type EmploymentSearchParams = AdminEmploymentInputs['search'];

export function searchEmployments(params: EmploymentSearchParams) {
  return apiClient.admin.employment.search.query(params);
}

export function getEmployment(id: number) {
  return apiClient.admin.employment.detail.query({ id });
}

export function createEmployment(body: AdminEmploymentInputs['create']) {
  return apiClient.admin.employment.create.mutate(body);
}

export function updateEmployment(
  id: number,
  data: {
    description?: string | null;
  },
) {
  return apiClient.admin.employment.update.mutate({ id, data });
}

export function pauseEmployment(id: number) {
  return apiClient.admin.employment.pause.mutate({ id });
}

export function resumeEmployment(
  id: number,
  expectedAncestorOrgCode: string,
) {
  return apiClient.admin.employment.resume.mutate({
    id,
    expectedAncestorOrgCode,
  });
}

export function endEmployment(id: number) {
  return apiClient.admin.employment.end.mutate({ id });
}

export function transferEmployment(
  id: number,
  data: AdminEmploymentInputs['transfer']['data'],
) {
  return apiClient.admin.employment.transfer.mutate({ id, data });
}

export function setPrimaryEmployment(id: number) {
  return apiClient.admin.employment.setPrimary.mutate({ id });
}

export function clearPrimaryEmployment(id: number) {
  return apiClient.admin.employment.clearPrimary.mutate({ id });
}

export function resignUser(username: string) {
  return apiClient.admin.employment.resignUser.mutate({ username });
}
