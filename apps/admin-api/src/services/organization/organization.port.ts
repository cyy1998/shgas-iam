import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
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

export type AdminOrganizationUnitOfWorkPort = UnitOfWorkPort<AdminOrganizationTransactionPorts>;

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
