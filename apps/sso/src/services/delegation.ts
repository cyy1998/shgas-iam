import type {
  DelegationCreateInput,
  DelegationDetail,
  DelegationSearchInput,
  DelegationUpdateInput,
} from "@iam/delegation/wire";
import { DelegationDetailSchema } from "@iam/delegation/wire";
import { request } from "@sso/utils/request";

export type { DelegationDetail } from "@iam/delegation/wire";
export type DelegationDirection = "outgoing" | "incoming";
export type PersonalDelegationCreate = Omit<DelegationCreateInput, "delegatorUsername" | "clientId"> & {
  clientId: number;
};

export async function createPersonalDelegation(input: PersonalDelegationCreate) {
  const result = await request<{ changed: boolean; result: unknown }>("/public/delegations", {
    method: "POST",
    body: JSON.stringify(input),
    suppressErrorMessage: true,
  });
  return { changed: result.changed, result: DelegationDetailSchema.parse(result.result) };
}
export async function updatePersonalDelegation(id: number, input: DelegationUpdateInput) {
  const result = await request<{ changed: boolean; result: unknown }>(`/public/delegations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    suppressErrorMessage: true,
  });
  return { changed: result.changed, result: DelegationDetailSchema.parse(result.result) };
}
export async function searchPersonalDelegations(
  direction: DelegationDirection,
  query: DelegationSearchInput = {},
): Promise<DelegationDetail[]> {
  const result = await request<unknown[]>("/public/delegations/search", {
    method: "POST",
    body: JSON.stringify({ ...query, direction }),
    suppressErrorMessage: true,
  });
  return result.map((record) => DelegationDetailSchema.parse(record));
}
export type DelegationUserChoice = Pick<DelegationDetail["delegateeUser"], "id" | "username" | "name">;
export type DelegationClientChoice = Pick<DelegationDetail["client"], "id" | "clientCode" | "clientName">;
export type DelegationOrganizationChoice = Pick<DelegationDetail["organizationScope"], "id" | "orgCode" | "orgName">;
function choices<T>(kind: string, search = "") {
  const query = new URLSearchParams({ search });
  return request<T[]>(`/public/delegations/choices/${kind}?${query}`, { suppressErrorMessage: true });
}
export const getDelegationUsers = (search?: string) => choices<DelegationUserChoice>("users", search);
export const getDelegationClients = (search?: string) => choices<DelegationClientChoice>("clients", search);
export const getDelegationOrganizations = (search?: string) =>
  choices<DelegationOrganizationChoice>("organizations", search);
