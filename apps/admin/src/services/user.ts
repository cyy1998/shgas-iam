import { apiClient } from '@/lib/api-client';
import type { AppRouter } from '@iam/api/trpc';
import type { Status } from '@iam/shared';
import type { inferRouterOutputs } from '@trpc/server';

type AdminUserOutputs = inferRouterOutputs<AppRouter>['admin']['user'];
export type UserVo = AdminUserOutputs['search']['result'][number];
export type UserDetailVo = AdminUserOutputs['detail'];
export type UserCreateResult = AdminUserOutputs['create'];

export type UserSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: {
      userTypes?: string[];
      usernames?: string[];
      phones?: string[];
      wxIds?: string[];
      names?: string[];
      statuses?: Status[];
    };
  };
};

export function searchUsers(params: UserSearchParams) {
  return apiClient.admin.user.search.query(params);
}

export function getUser(username: string) {
  return apiClient.admin.user.detail.query({ username });
}

export function createUser(body: {
  username: string;
  name: string;
  userType: string;
  password?: string;
  mobile?: string | null;
  wxId?: string | null;
  status?: Status;
}) {
  return apiClient.admin.user.create.mutate(body);
}

export function updateUser(
  username: string,
  data: {
    name?: string;
    mobile?: string | null;
    wxId?: string | null;
    userType?: string;
    status?: Status;
    orderNum?: number;
  },
) {
  return apiClient.admin.user.update.mutate({ username, data });
}

export function updateUserStatus(username: string, status: Status) {
  return apiClient.admin.user.updateStatus.mutate({ username, status });
}

export function deleteUser(username: string) {
  return apiClient.admin.user.delete.mutate({ username });
}

export function resetUserPassword(username: string) {
  return apiClient.admin.user.resetPassword.mutate({ username });
}

export function generateRandomPassword() {
  return apiClient.admin.user.generatePassword.query(undefined);
}
