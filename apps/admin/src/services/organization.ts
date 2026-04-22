import { apiClient } from '@/lib/api-client';
import type { AppRouter } from '@iam/api/trpc';
import { Status } from '@iam/shared';
import type { inferRouterOutputs } from '@trpc/server';

type AdminOrgOutputs = inferRouterOutputs<AppRouter>['admin']['organization'];
export type OrganizationVo = AdminOrgOutputs['search']['result'][number];
export type OrganizationDetailVo = AdminOrgOutputs['detail'];
export type OrganizationChildrenPage = AdminOrgOutputs['children'];
export type OrganizationTreeNode = OrganizationChildrenPage['result'][number];

export type OrganizationSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: {
      orgType?: string;
      status?: number;
      parentOrgCode?: string;
    };
  };
};

export function searchOrganizations(params: OrganizationSearchParams) {
  return apiClient.admin.organization.search.query(params);
}

export function getOrganizationChildren(
  parentOrgCode: string | null = null,
  pageNum: number = 1,
  pageSize: number = 50,
) {
  return apiClient.admin.organization.children.query({
    parentOrgCode,
    pageNum,
    pageSize,
  });
}

export function getOrganization(orgCode: string) {
  return apiClient.admin.organization.detail.query({ orgCode });
}

export function createOrganization(body: {
  orgCode: string;
  orgName: string;
  orgType: string;
  parentCode?: string | null;
  status?: Status;
}) {
  return apiClient.admin.organization.create.mutate(body);
}

export function updateOrganization(
  orgCode: string,
  data: { orgName?: string; orgType?: string; status?: Status },
) {
  return apiClient.admin.organization.update.mutate({ orgCode, data });
}

export function updateOrganizationStatus(orgCode: string, status: Status) {
  return apiClient.admin.organization.updateStatus.mutate({ orgCode, status });
}

export function deleteOrganization(orgCode: string) {
  return apiClient.admin.organization.delete.mutate({ orgCode });
}
