import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@iam/api/trpc";
import { Status } from "@iam/shared";
import { apiClient } from "@/lib/api-client";

type AdminOrgOutputs = inferRouterOutputs<AppRouter>["admin"]["organization"];
export type OrganizationVo = AdminOrgOutputs["search"]["result"][number];
export type OrganizationDetailVo = AdminOrgOutputs["detail"];
export type OrganizationTreeNode = AdminOrgOutputs["tree"][number];

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

export function getOrganizationTree() {
  return apiClient.admin.organization.tree.query();
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
