import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  Organization,
  OrganizationCreateDto,
  OrganizationQueryDto,
  OrganizationUpdateDto,
} from "./organization.type";

export interface OrganizationReaderPort {
  getOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  searchOrganizations: (query: OrganizationQueryDto) => Promise<Organization[]>;
}

export interface OrganizationTransactionStorePort {
  getAnyOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getOrganizationByCodeForAdmin: (orgCode: string) => Promise<Organization | null>;
  setOrganization: (input: OrganizationCreateDto, parent: Organization | null) => Promise<unknown>;
  updateOrganizationByCode: (orgCode: string, input: OrganizationUpdateDto) => Promise<unknown>;
}

export interface ApiOrganizationProfileChange {
  readonly kind: "organization";
  readonly organizationId: number;
}

export interface OrganizationTransactionPorts {
  organizationRepository: OrganizationTransactionStorePort;
  userProfileInvalidation: {
    recordChanges: (changes: readonly ApiOrganizationProfileChange[]) => Promise<void>;
  };
}

export type OrganizationUnitOfWorkPort = UnitOfWorkPort<OrganizationTransactionPorts>;

export interface OrganizationServiceDeps {
  organizationRepository: OrganizationReaderPort;
  uow: OrganizationUnitOfWorkPort;
}
