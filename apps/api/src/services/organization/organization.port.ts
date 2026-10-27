import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { Organization, OrganizationCreateDto, OrganizationUpdateDto } from "./organization.type";

export interface OrganizationReaderPort {
  getOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
}

export interface OrganizationTransactionStorePort {
  getAnyOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getOrganizationByCodeForAdmin: (orgCode: string) => Promise<Organization | null>;
  setOrganization: (input: OrganizationCreateDto, parent: Organization | null) => Promise<{ id: number }>;
  updateOrganizationByCode: (orgCode: string, input: OrganizationUpdateDto) => Promise<{ id: number } | null>;
}

export interface ApiOrganizationProfileChange {
  readonly kind: "organization";
  readonly organizationId: number;
}

export type ApiOrganizationDocumentChangedField = "code" | "name" | "type" | "status";
export type ApiOrganizationDocumentChange =
  | { kind: "created"; organizationId: number }
  | { kind: "updated"; organizationId: number; changedFields: readonly ApiOrganizationDocumentChangedField[] };

export interface OrganizationTransactionPorts {
  organizationRepository: OrganizationTransactionStorePort;
  responsibilityParentLifecycle: {
    assertNoOpenAssignmentsTargetingOrganizationSubtree: (input: { organizationId: number }) => Promise<void>;
  };
  organizationDocumentInvalidation: {
    recordChanges: (changes: readonly ApiOrganizationDocumentChange[]) => Promise<void>;
  };
  userDocumentInvalidation: {
    recordChanges: (changes: readonly ApiOrganizationProfileChange[]) => Promise<void>;
  };
}

export type OrganizationUnitOfWorkPort = UnitOfWorkPort<OrganizationTransactionPorts>;

export interface OrganizationServiceDeps {
  organizationRepository: OrganizationReaderPort;
  uow: OrganizationUnitOfWorkPort;
}
