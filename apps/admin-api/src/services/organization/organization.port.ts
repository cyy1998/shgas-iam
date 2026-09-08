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
  lockOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getAnyOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getOrganizationByCode: (orgCode: string) => Promise<AdminOrganizationRecord | null>;
  getOrganizationByCodeForAdmin: (orgCode: string) => Promise<AdminOrganizationRecord | null>;
  setOrganization: (
    input: OrganizationCreateDto,
    parent: Organization | null,
  ) => Promise<AdminOrganizationRecord>;
  updateOrganizationByCode: (orgCode: string, input: OrganizationUpdateDto) => Promise<Organization | null>;
  countActiveChildrenByOrgCode: (orgCode: string) => Promise<number>;
  countOpenEmploymentsByOrgCode: (orgCode: string) => Promise<number>;
  softDeleteOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
}

export interface AdminOrganizationReaderPort {
  getAnyOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  listOrgChildrenByParentCode: (
    parentOrgCode: string | null,
    pageNum: number,
    pageSize: number,
    scope?: AdminOrganizationReadScope,
  ) => Promise<{ rows: AdminOrganizationChildRecord[]; total: number }>;
  getOrganizationByCodeForAdmin: (
    orgCode: string,
    scope?: AdminOrganizationReadScope,
  ) => Promise<AdminOrganizationRecord | null>;
  countOpenEmploymentsByOrgCode: (orgCode: string) => Promise<number>;
  searchOrganizationsForAdmin: (
    query: OrganizationPaginationQueryDto,
    scope?: AdminOrganizationReadScope,
  ) => Promise<AdminOrganizationRecord[]>;
  getOrganizationSelectorNodesForAdmin: (
    query: OrganizationSelectorQueryDto,
    scope?: AdminOrganizationReadScope,
  ) => Promise<OrganizationSelectorNode[]>;
}

export interface AdminOrganizationReadScope {
  organizationIds: readonly number[];
  rootOrganizationIds: readonly number[];
}

export interface AdminOrganizationProfileChange {
  readonly kind: "organization";
  readonly organizationId: number;
}

export interface AdminOrganizationTransactionPorts {
  organizationRepository: AdminOrganizationTransactionStorePort;
  auditService: AuditLogWriterPort;
  responsibilityParentLifecycle: {
    assertNoOpenAssignmentsTargetingOrganizationSubtree: (input: {
      organizationId: number;
    }) => Promise<void>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly AdminOrganizationProfileChange[]) => Promise<void>;
  };
}

export type AdminOrganizationUnitOfWorkPort = UnitOfWorkPort<AdminOrganizationTransactionPorts>;

export interface AdminOrganizationServiceDeps {
  organizationRepository: AdminOrganizationReaderPort;
  responsibilityReader: {
    hasOpenAssignmentTargetingOrganizationSubtree: (
      organizationId: number,
    ) => Promise<boolean>;
    hasOpenAssignmentTargetingOrganizationSubtreeOutsideScope: (
      organizationId: number,
      organizationIds: readonly number[],
    ) => Promise<boolean>;
  };
  uow: AdminOrganizationUnitOfWorkPort;
}
