import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type AdminOrgInputs = inferRouterInputs<AppRouter>['admin']['organization'];
type AdminOrgOutputs = inferRouterOutputs<AppRouter>['admin']['organization'];
export type OrganizationVo = AdminOrgOutputs['search']['result'][number];
export type OrganizationDetailVo = AdminOrgOutputs['detail'];
export type OrganizationChildrenPage = AdminOrgOutputs['children'];
export type OrganizationTreeNode = OrganizationChildrenPage['result'][number];
export type OrganizationSelectorNode = AdminOrgOutputs['selector'][number];

export type OrganizationSearchParams = AdminOrgInputs['search'];
export type OrganizationSelectorParams = AdminOrgInputs['selector'];

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

export function getOrganizationSelectorNodes(params: OrganizationSelectorParams) {
  return apiClient.admin.organization.selector.query(params);
}

export function getOrganization(orgCode: string) {
  return apiClient.admin.organization.detail.query({ orgCode });
}

export function createOrganization(body: AdminOrgInputs['create']) {
  return apiClient.admin.organization.create.mutate(body);
}

export function updateOrganization(
  orgCode: string,
  data: AdminOrgInputs['update']['data'],
) {
  return apiClient.admin.organization.update.mutate({ orgCode, data });
}

export function updateOrganizationStatus(orgCode: string, status: AdminOrgInputs['updateStatus']['status']) {
  return apiClient.admin.organization.updateStatus.mutate({ orgCode, status });
}

export function deleteOrganization(orgCode: string) {
  return apiClient.admin.organization.delete.mutate({ orgCode });
}
