import type { OrganizationRepository } from "./organization.repository";

export interface OrganizationTransactionPorts {
  organizationRepository: Pick<
    OrganizationRepository,
    | "getOrganizationByCode"
    | "getOrganizationByCodeForAdmin"
    | "setOrganization"
    | "updateOrganizationByCode"
  >;
}

export interface OrganizationUnitOfWorkPort {
  transaction: <T>(callback: (tx: OrganizationTransactionPorts) => Promise<T>) => Promise<T>;
}

export interface OrganizationServiceDeps {
  organizationRepository: Pick<OrganizationRepository, "getOrganizationByCode" | "searchOrganizations">;
  uow: OrganizationUnitOfWorkPort;
}
