import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
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
  getOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
  getOrganizationByCodeForAdmin: (orgCode: string) => Promise<Organization | null>;
  setOrganization: (input: OrganizationCreateDto, parent: Organization | null) => Promise<unknown>;
  updateOrganizationByCode: (orgCode: string, input: OrganizationUpdateDto) => Promise<unknown>;
}

export interface OrganizationTransactionPorts {
  organizationRepository: OrganizationTransactionStorePort;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markScopeDirty">;
}

export type OrganizationUnitOfWorkPort = UnitOfWorkPort<OrganizationTransactionPorts>;

export interface OrganizationServiceDeps {
  organizationRepository: OrganizationReaderPort;
  uow: OrganizationUnitOfWorkPort;
}
