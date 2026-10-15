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

export type ApiOrganizationSearchChangedField = "code" | "name" | "type" | "status";
export type ApiOrganizationSearchChange =
  | { kind: "created"; organizationId: number }
  | { kind: "updated"; organizationId: number; changedFields: readonly ApiOrganizationSearchChangedField[] };

export interface OrganizationTransactionPorts {
  organizationRepository: OrganizationTransactionStorePort;
  organizationSearchInvalidation: {
    recordChanges: (changes: readonly ApiOrganizationSearchChange[]) => Promise<void>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly ApiOrganizationProfileChange[]) => Promise<void>;
  };
}

export type OrganizationUnitOfWorkPort = UnitOfWorkPort<OrganizationTransactionPorts>;

export interface OrganizationServiceDeps {
  organizationRepository: OrganizationReaderPort;
  uow: OrganizationUnitOfWorkPort;
}
