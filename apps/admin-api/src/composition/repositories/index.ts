import type { DbClient } from "@iam/db";
import { createAuditRepository } from "@admin-api/services/audit/audit.repository";
import { createClientRepository } from "@admin-api/services/client/client.repository";
import { createEmploymentRepository } from "@admin-api/services/employment/employment.repository";
import { createOrganizationResponsibilityRepository } from "@admin-api/services/organization-responsibility/organization-responsibility.repository";
import { createOrganizationRepository } from "@admin-api/services/organization/organization.repository";
import { createPositionRepository } from "@admin-api/services/position/position.repository";
import { createPrivilegeRepository } from "@admin-api/services/privilege/privilege.repository";
import { createRoleRepository } from "@admin-api/services/role/role.repository";
import { createUserRepository } from "@admin-api/services/user/user.repository";

export function createAdminApiRepositories(client: DbClient) {
  return {
    audit: createAuditRepository(client),
    client: createClientRepository(client),
    employment: createEmploymentRepository(client),
    organization: createOrganizationRepository(client),
    organizationResponsibility: createOrganizationResponsibilityRepository(client),
    position: createPositionRepository(client),
    privilege: createPrivilegeRepository(client),
    role: createRoleRepository(client),
    user: createUserRepository(client),
  };
}

export type AdminApiRepositories = ReturnType<typeof createAdminApiRepositories>;
