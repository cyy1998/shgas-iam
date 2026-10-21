import { apiClient } from "@admin/lib/api-client";
import { AdminMutationCommittedError, runAdminMutation } from "@admin/services/admin-mutation";
import type { AppRouter } from "@iam/admin-api/trpc";
import { TRPCClientError } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

type Inputs = inferRouterInputs<AppRouter>["admin"]["delegation"];
type Outputs = inferRouterOutputs<AppRouter>["admin"]["delegation"];
export type DelegationVo = Outputs["search"][number];
export type DelegationCreateInput = Inputs["create"];
export type DelegationUpdateInput = Inputs["update"]["data"];
export type DelegationSearchInput = Inputs["search"];
export type DelegationSelectorInput = Inputs["selectUsers"];

export class DelegationWriteUnconfirmedError extends Error {
  constructor(cause: unknown) {
    super("操作结果尚未确认，请刷新核对后再决定下一步，勿重复提交", { cause });
  }
}

async function write<T>(operation: () => Promise<T>) {
  try {
    return await runAdminMutation(operation);
  } catch (error) {
    if (error instanceof AdminMutationCommittedError) throw error;
    if (error instanceof TRPCClientError && [400, 401, 403, 404, 409, 422].includes(error.data?.httpStatus))
      throw error;
    throw new DelegationWriteUnconfirmedError(error);
  }
}

export function searchDelegations(input: DelegationSearchInput = {}) {
  return apiClient.admin.delegation.search.query(input);
}
export function createDelegation(input: DelegationCreateInput) {
  return write(() => apiClient.admin.delegation.create.mutate(input));
}
export function updateDelegation(id: number, data: DelegationUpdateInput) {
  return write(() => apiClient.admin.delegation.update.mutate({ id, data }));
}
export function selectDelegationUsers(input: DelegationSelectorInput) {
  return apiClient.admin.delegation.selectUsers.query(input);
}
export function selectDelegationClients(input: DelegationSelectorInput) {
  return apiClient.admin.delegation.selectClients.query(input);
}
export function selectDelegationOrganizations(input: DelegationSelectorInput) {
  return apiClient.admin.delegation.selectOrganizations.query(input);
}
