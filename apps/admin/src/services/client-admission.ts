import { apiClient } from "@admin/lib/api-client";
import { getOrganization } from "@admin/services/organization";
import { getPosition } from "@admin/services/position";
import { getRole } from "@admin/services/role";
import type { AppRouter } from "@iam/admin-api/trpc";
import { ApiErrorCode, RoleType } from "@iam/contracts";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { runAdminMutation } from "./admin-mutation";

const client = apiClient.admin.clientAdmission;
type AdmissionInputs = inferRouterInputs<AppRouter>["admin"]["clientAdmission"];
type AdmissionOutputs = inferRouterOutputs<AppRouter>["admin"]["clientAdmission"];
export type ClientAdmissionPolicy = Pick<AdmissionOutputs["detail"], "enabled" | "filter">;
export type ClientAdmissionDetail = AdmissionOutputs["detail"];
export type ClientAdmissionFilter = NonNullable<ClientAdmissionPolicy["filter"]>;
export type ClientAdmissionPreview = AdmissionOutputs["preview"]["status"];

export const clientAdmissionService = {
  detail: (clientCode: string) => client.detail.query({ clientCode }),
  save: (clientCode: string, filter: AdmissionInputs["save"]["data"]["filter"]) =>
    runAdminMutation(() => client.save.mutate({ clientCode, data: { filter } })),
  setEnabled: (clientCode: string, enabled: boolean) =>
    runAdminMutation(() => client.setEnabled.mutate({ clientCode, data: { enabled } })),
  preview: (clientCode: string, data: AdmissionInputs["preview"]["data"]) =>
    client.preview.mutate({ clientCode, data }),
};

const notFoundCodes = {
  organization: ApiErrorCode.OrganizationNotFound,
  position: ApiErrorCode.PositionNotFound,
  role: ApiErrorCode.RoleNotFound,
};
export type AdmissionReferenceKind = keyof typeof notFoundCodes;
export type AdmissionReferenceStatus = "found" | "missing" | "unavailable";

export function classifyAdmissionFailure(error: unknown) {
  const data = admissionErrorData(error);
  if (data === undefined) return "unknown";
  const status = "httpStatus" in data ? data.httpStatus : undefined;
  if (status === 400 || status === 422) return "invalid-input";
  if (status === 401 || status === 403 || status === 404 || status === 409) return "rejected";
  if (status === 429 || status === 503) return "unavailable";
  return "unknown";
}

export async function checkAdmissionReference(
  kind: AdmissionReferenceKind,
  code: string,
  clientCode: string,
): Promise<AdmissionReferenceStatus> {
  try {
    switch (kind) {
      case "organization": {
        const organization = await getOrganization(code);
        return organization.orgCode === code ? "found" : "missing";
      }
      case "position": {
        const position = await getPosition(code);
        return position.posCode === code ? "found" : "missing";
      }
      case "role": {
        const role = await getRole(code);
        return role.roleCode === code && (role.roleType === RoleType.Global || role.client?.clientCode === clientCode)
          ? "found"
          : "missing";
      }
    }
  } catch (error) {
    const data = admissionErrorData(error);
    if (data !== undefined && "serviceCode" in data && data.serviceCode === notFoundCodes[kind]) return "missing";
    return "unavailable";
  }
}

function admissionErrorData(error: unknown) {
  const data = typeof error === "object" && error !== null && "data" in error ? error.data : undefined;
  return typeof data === "object" && data !== null ? data : undefined;
}
