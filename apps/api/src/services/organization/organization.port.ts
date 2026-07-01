import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type { OrganizationRepository } from "./organization.repository";

export interface OrganizationTransactionPorts {
  organizationRepository: Pick<
    OrganizationRepository,
    | "getOrganizationByCode"
    | "getOrganizationByCodeForAdmin"
    | "setOrganization"
    | "updateOrganizationByCode"
  >;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markScopeDirty">;
}

export type OrganizationUnitOfWorkPort = UnitOfWorkPort<OrganizationTransactionPorts>;

export interface OrganizationServiceDeps {
  organizationRepository: Pick<OrganizationRepository, "getOrganizationByCode" | "searchOrganizations">;
  uow: OrganizationUnitOfWorkPort;
}
