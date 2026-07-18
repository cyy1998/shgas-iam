import type { DbClient } from "@iam/db";
import type { UserProfileAffectedUserResolverPort } from "@iam/user-profile-read-model/producer";
import { createAuditRepository } from "@admin-api/services/audit/audit.repository";
import { createClientRepository } from "@admin-api/services/client/client.repository";
import { createEmploymentRepository } from "@admin-api/services/employment/employment.repository";
import { createOrganizationRepository } from "@admin-api/services/organization/organization.repository";
import { createPositionRepository } from "@admin-api/services/position/position.repository";
import { createPrivilegeRepository } from "@admin-api/services/privilege/privilege.repository";
import { createRoleRepository } from "@admin-api/services/role/role.repository";
import { createUserRepository } from "@admin-api/services/user/user.repository";
import { createUserProfileDirtyRepository, createUserProfileScopeRepository } from "@iam/user-profile-read-model/producer";

export function createAdminApiRepositories(
  client: DbClient,
  roleAssignmentResolver: UserProfileAffectedUserResolverPort,
) {
  return {
    audit: createAuditRepository(client),
    client: createClientRepository(client),
    employment: createEmploymentRepository(client),
    organization: createOrganizationRepository(client),
    position: createPositionRepository(client),
    privilege: createPrivilegeRepository(client),
    role: createRoleRepository(client),
    user: createUserRepository(client),
    userProfileDirty: createUserProfileDirtyRepository(client),
    userProfileScope: createUserProfileScopeRepository(client, roleAssignmentResolver),
  };
}

export type AdminApiRepositories = ReturnType<typeof createAdminApiRepositories>;
