import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
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
  countOpenEmploymentsByOrgCode: (orgCode: string) => Promise<number>;
  softDeleteOrganizationByCode: (orgCode: string) => Promise<unknown>;
}

export interface AdminOrganizationReaderPort {
  listOrgChildrenByParentCode: (
    parentOrgCode: string | null,
    pageNum: number,
    pageSize: number,
  ) => Promise<{ rows: AdminOrganizationChildRecord[]; total: number }>;
  getOrganizationByCodeForAdmin: (orgCode: string) => Promise<AdminOrganizationRecord | null>;
  countOpenEmploymentsByOrgCode: (orgCode: string) => Promise<number>;
  searchOrganizationsForAdmin: (
    query: OrganizationPaginationQueryDto,
  ) => Promise<AdminOrganizationRecord[]>;
  getOrganizationSelectorNodesForAdmin: (
    query: OrganizationSelectorQueryDto,
  ) => Promise<OrganizationSelectorNode[]>;
}

export interface AdminOrganizationProfileChange {
  readonly kind: "organization";
  readonly organizationId: number;
}

export interface AdminOrganizationTransactionPorts {
  organizationRepository: AdminOrganizationTransactionStorePort;
  auditService: AuditLogWriterPort;
  userProfileInvalidation: {
    recordChanges: (changes: readonly AdminOrganizationProfileChange[]) => Promise<void>;
  };
}

export type AdminOrganizationUnitOfWorkPort = UnitOfWorkPort<AdminOrganizationTransactionPorts>;

export interface AdminOrganizationServiceDeps {
  organizationRepository: AdminOrganizationReaderPort;
  uow: AdminOrganizationUnitOfWorkPort;
}
