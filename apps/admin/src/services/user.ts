import { apiClient } from '@admin/lib/api-client';
import { runAdminMutation } from '@admin/services/admin-mutation';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type AdminUserInputs = inferRouterInputs<AppRouter>['admin']['user'];
type AdminUserOutputs = inferRouterOutputs<AppRouter>['admin']['user'];
export type UserVo = AdminUserOutputs['search']['result'][number];
export type UserDetailVo = AdminUserOutputs['detail'];
export type UserCreateResult = AdminUserOutputs['create'];

export type UserSearchParams = AdminUserInputs['search'];

export function searchUsers(params: UserSearchParams) {
  return apiClient.admin.user.search.query(params);
}

export function getUser(username: string) {
  return apiClient.admin.user.detail.query({ username });
}

export function createUser(body: AdminUserInputs['create']) {
  return runAdminMutation(() => apiClient.admin.user.create.mutate(body));
}

export function updateUser(
  username: string,
  data: AdminUserInputs['update']['data'],
) {
  return runAdminMutation(() =>
    apiClient.admin.user.update.mutate({ username, data }),
  );
}

export function updateUserStatus(
  username: string,
  status: AdminUserInputs['updateStatus']['status'],
) {
  return runAdminMutation(() =>
    apiClient.admin.user.updateStatus.mutate({ username, status }),
  );
}

export function deleteUser(username: string) {
  return runAdminMutation(() =>
    apiClient.admin.user.delete.mutate({ username }),
  );
}

export function resetUserPassword(username: string) {
  return runAdminMutation(() =>
    apiClient.admin.user.resetPassword.mutate({ username }),
  );
}

export function generateRandomPassword() {
  return apiClient.admin.user.generatePassword.query(undefined);
}
