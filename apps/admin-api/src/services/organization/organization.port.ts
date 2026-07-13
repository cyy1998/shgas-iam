import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type {
  AdminOrganizationChildRecord,
  AdminOrganizationRecord,
  Organization,
  OrganizationCreateDto,
  OrganizationPaginationQueryDto,
  OrganizationSelectorNode,
  OrganizationSelectorQueryDto,
  OrganizationUpdateDto,
} from "./organization.type";

export interface AdminOrganizationTransactionStorePort {
  getOrganizationByCode: (orgCode: string) => Promise<AdminOrganizationRecord | null>;
  getOrganizationByCodeForAdmin: (orgCode: string) => Promise<AdminOrganizationRecord | null>;
  setOrganization: (
    input: OrganizationCreateDto,
    parent: Organization | null,
  ) => Promise<AdminOrganizationRecord>;
  updateOrganizationByCode: (orgCode: string, input: OrganizationUpdateDto) => Promise<unknown>;
  countActiveChildrenByOrgCode: (orgCode: string) => Promise<number>;
  countActiveEmploymentsByOrgCode: (orgCode: string) => Promise<number>;
  softDeleteOrganizationByCode: (orgCode: string) => Promise<unknown>;
}

export interface AdminOrganizationReaderPort {
  listOrgChildrenByParentCode: (
    parentOrgCode: string | null,
    pageNum: number,
    pageSize: number,
  ) => Promise<{ rows: AdminOrganizationChildRecord[]; total: number }>;
  getOrganizationByCodeForAdmin: (orgCode: string) => Promise<AdminOrganizationRecord | null>;
  countActiveEmploymentsByOrgCode: (orgCode: string) => Promise<number>;
  searchOrganizationsForAdmin: (
    query: OrganizationPaginationQueryDto,
  ) => Promise<AdminOrganizationRecord[]>;
  getOrganizationSelectorNodesForAdmin: (
    query: OrganizationSelectorQueryDto,
  ) => Promise<OrganizationSelectorNode[]>;
}

export interface AdminOrganizationTransactionPorts {
  organizationRepository: AdminOrganizationTransactionStorePort;
  auditService: AuditLogWriterPort;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markScopeDirty">;
}

export type AdminOrganizationUnitOfWorkPort = UnitOfWorkPort<AdminOrganizationTransactionPorts>;

export interface AdminOrganizationServiceDeps {
  organizationRepository: AdminOrganizationReaderPort;
  uow: AdminOrganizationUnitOfWorkPort;
}
