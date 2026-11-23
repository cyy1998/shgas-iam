import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type {
  CustomAttributeDefinitionReader,
  CustomAttributeValueWritePort,
} from "@admin-api/services/custom-attribute/custom-attribute.port";
import type { UnitOfWorkPort } from "@iam/unit-of-work";
import type {
  AdminOrganizationChildRecord,
  AdminOrganizationRecord,
  Organization,
  OrganizationCreateValues,
  OrganizationPaginationQueryDto,
  OrganizationSelectorNode,
  OrganizationSelectorQueryDto,
  OrganizationUpdateValues,
} from "./organization.type";

export interface AdminOrganizationTransactionStorePort {
  lockOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getAnyOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getOrganizationByCode: (orgCode: string) => Promise<AdminOrganizationRecord | null>;
  getOrganizationByCodeForAdmin: (orgCode: string) => Promise<AdminOrganizationRecord | null>;
  setOrganization: (input: OrganizationCreateValues, parent: Organization | null) => Promise<AdminOrganizationRecord>;
  updateOrganizationByCode: (orgCode: string, input: OrganizationUpdateValues) => Promise<Organization | null>;
  hasOpenDelegationsByOrganizationId: (organizationId: number) => Promise<boolean>;
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
  readonly kind: "organization" | "organization-custom-attributes";
  readonly organizationId: number;
}

export type AdminOrganizationDocumentChangedField = "code" | "name" | "type" | "status" | "customAttributes";
export type AdminOrganizationDocumentChange =
  | { kind: "created" | "deleted"; organizationId: number }
  | { kind: "updated"; organizationId: number; changedFields: readonly AdminOrganizationDocumentChangedField[] };

export interface AdminOrganizationTransactionPorts {
  organizationRepository: AdminOrganizationTransactionStorePort;
  customAttributeDefinitions: CustomAttributeValueWritePort;
  auditService: AuditLogWriterPort;
  responsibilityParentLifecycle: {
    assertNoOpenAssignmentsTargetingOrganizationSubtree: (input: { organizationId: number }) => Promise<void>;
  };
  userDocumentInvalidation: {
    recordChanges: (changes: readonly AdminOrganizationProfileChange[]) => Promise<void>;
  };
  organizationDocumentInvalidation: {
    recordChanges: (changes: readonly AdminOrganizationDocumentChange[]) => Promise<void>;
  };
}

export type AdminOrganizationUnitOfWorkPort = UnitOfWorkPort<AdminOrganizationTransactionPorts>;

export interface AdminOrganizationServiceDeps {
  organizationRepository: AdminOrganizationReaderPort;
  customAttributeDefinitions: CustomAttributeDefinitionReader;
  responsibilityReader: {
    hasOpenAssignmentTargetingOrganizationSubtree: (organizationId: number) => Promise<boolean>;
    hasOpenAssignmentTargetingOrganizationSubtreeOutsideScope: (
      organizationId: number,
      organizationIds: readonly number[],
    ) => Promise<boolean>;
  };
  uow: AdminOrganizationUnitOfWorkPort;
}
