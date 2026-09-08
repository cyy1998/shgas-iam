import { apiClient } from '@admin/lib/api-client';
import { runAdminMutation } from '@admin/services/admin-mutation';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type AdminRoleInputs = inferRouterInputs<AppRouter>['admin']['role'];
type AdminRoleOutputs = inferRouterOutputs<AppRouter>['admin']['role'];

export type RoleVo = AdminRoleOutputs['search']['result'][number];
export type RoleDetailVo = AdminRoleOutputs['detail'];
export type RoleAssignmentVo =
  AdminRoleOutputs['assignments']['search']['result'][number];

export type RoleSearchParams = AdminRoleInputs['search'];
export type RoleAssignmentSearchParams =
  AdminRoleInputs['assignments']['search']['query'];
export type RoleCreateInput = AdminRoleInputs['create'];
export type RoleUpdateInput = AdminRoleInputs['update']['data'];
export type RoleAssignmentCreateInput =
  AdminRoleInputs['assignments']['create']['data'];

export function searchRoles(params: RoleSearchParams) {
  return apiClient.admin.role.search.query(params);
}

export function getRole(roleCode: string) {
  return apiClient.admin.role.detail.query({ roleCode });
}

export function createRole(body: RoleCreateInput) {
  return runAdminMutation(() => apiClient.admin.role.create.mutate(body));
}

export function updateRole(roleCode: string, data: RoleUpdateInput) {
  return runAdminMutation(() =>
    apiClient.admin.role.update.mutate({ roleCode, data }),
  );
}

export function updateRoleStatus(
  roleCode: string,
  status: AdminRoleInputs['updateStatus']['status'],
) {
  return runAdminMutation(() =>
    apiClient.admin.role.updateStatus.mutate({ roleCode, status }),
  );
}

export function deleteRole(roleCode: string) {
  return runAdminMutation(() =>
    apiClient.admin.role.delete.mutate({ roleCode }),
  );
}

export function searchRoleAssignments(
  roleCode: string,
  query: RoleAssignmentSearchParams,
) {
  return apiClient.admin.role.assignments.search.query({ roleCode, query });
}

export function createRoleAssignment(
  roleCode: string,
  data: RoleAssignmentCreateInput,
) {
  return runAdminMutation(() =>
    apiClient.admin.role.assignments.create.mutate({ roleCode, data }),
  );
}

export function updateRoleAssignmentScope(
  roleCode: string,
  assignmentId: number,
  includeDescendants: boolean,
) {
  return runAdminMutation(() =>
    apiClient.admin.role.assignments.updateScope.mutate({
      roleCode,
      assignmentId,
      includeDescendants,
    }),
  );
}

export function deleteRoleAssignment(roleCode: string, assignmentId: number) {
  return runAdminMutation(() =>
    apiClient.admin.role.assignments.delete.mutate({
      roleCode,
      assignmentId,
    }),
  );
}
