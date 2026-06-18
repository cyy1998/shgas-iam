import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { OrganizationRepository } from "./organization.repository";

export interface AdminOrganizationTransactionPorts {
  organizationRepository: Pick<
    OrganizationRepository,
    | "getOrganizationByCode"
    | "getOrganizationByCodeForAdmin"
    | "setOrganization"
    | "updateOrganizationByCode"
    | "countActiveChildrenByOrgCode"
    | "countActiveEmploymentsByOrgCode"
    | "softDeleteOrganizationByCode"
  >;
  auditService: AuditLogWriterPort;
}

export interface AdminOrganizationUnitOfWorkPort {
  transaction: <T>(callback: (tx: AdminOrganizationTransactionPorts) => Promise<T>) => Promise<T>;
}

export interface AdminOrganizationServiceDeps {
  organizationRepository: Pick<
    OrganizationRepository,
    | "listOrgChildrenByParentCode"
    | "getOrganizationByCodeForAdmin"
    | "countActiveEmploymentsByOrgCode"
    | "searchOrganizationsForAdmin"
    | "getOrganizationSelectorNodesForAdmin"
  >;
  uow: AdminOrganizationUnitOfWorkPort;
}
