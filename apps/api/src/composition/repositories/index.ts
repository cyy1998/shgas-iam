import type { DbClient } from "@iam/db";
import { createAuditRepository } from "@api/services/audit/audit.repository";
import { createClientRepository } from "@api/services/client/client.repository";
import { createCustomSsoClientRepository } from "@api/services/client/custom-sso-client.repository";
import { createEmploymentRepository } from "@api/services/employment/employment.repository";
import { createOrganizationRepository } from "@api/services/organization/organization.repository";
import { createPositionRepository } from "@api/services/position/position.repository";
import { createPrivilegeRepository } from "@api/services/privilege/privilege.repository";
import { createPrivilegeDelegationRepository } from "@api/services/privilege/privilegeDelegation.repository";
import { createUserRepository } from "@api/services/user/user.repository";
import { createUserProfileQueryRepository } from "@iam/user-profile-read-model/query/repository";

export function createApiRepositories(client: DbClient) {
  return {
    audit: createAuditRepository(client),
    client: createClientRepository(client),
    customSsoClient: createCustomSsoClientRepository(client),
    employment: createEmploymentRepository(client),
    organization: createOrganizationRepository(client),
    position: createPositionRepository(client),
    privilege: createPrivilegeRepository(client),
    privilegeDelegation: createPrivilegeDelegationRepository(client),
    user: createUserRepository(client),
    userProfile: createUserProfileQueryRepository(client),
  };
}

export type ApiRepositories = ReturnType<typeof createApiRepositories>;
