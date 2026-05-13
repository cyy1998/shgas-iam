import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterOutputs } from '@trpc/server';

type AdminEmploymentOutputs =
  inferRouterOutputs<AppRouter>['admin']['employment'];
export type EmploymentVo = AdminEmploymentOutputs['search']['result'][number];
export type EmploymentDetailVo = AdminEmploymentOutputs['detail'];

export type EmploymentSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: {
      usernames?: string[];
      companyOrgCodes?: string[];
      deptOrgCodes?: string[];
      posCodes?: string[];
      isPrimary?: boolean;
      statuses?: (1 | 2 | 3)[];
    };
  };
};

export function searchEmployments(params: EmploymentSearchParams) {
  return apiClient.admin.employment.search.query(params);
}

export function getEmployment(id: number) {
  return apiClient.admin.employment.detail.query({ id });
}

export function createEmployment(body: {
  username: string;
  companyOrgCode: string;
  deptOrgCode: string;
  posCode: string;
  isPrimary?: boolean;
  startTime?: Date;
  description?: string | null;
}) {
  return apiClient.admin.employment.create.mutate(body);
}

export function updateEmployment(
  id: number,
  data: {
    isPrimary?: boolean;
    startTime?: Date;
    description?: string | null;
  },
) {
  return apiClient.admin.employment.update.mutate({ id, data });
}

export function updateEmploymentStatus(id: number, status: 1 | 2 | 3) {
  return apiClient.admin.employment.updateStatus.mutate({ id, status });
}

export function deleteEmployment(id: number) {
  return apiClient.admin.employment.delete.mutate({ id });
}

export function transferEmployment(
  id: number,
  data: {
    newCompanyOrgCode: string;
    newDeptOrgCode: string;
    newPosCode: string;
    startTime?: Date;
    inheritPrimary?: boolean;
    description?: string | null;
  },
) {
  return apiClient.admin.employment.transfer.mutate({ id, data });
}

export function setPrimaryEmployment(id: number) {
  return apiClient.admin.employment.setPrimary.mutate({ id });
}

export function resignUser(username: string) {
  return apiClient.admin.employment.resignUser.mutate({ username });
}
