import type { DbClient } from "@iam/db";
import { createAuditRepository } from "@iam/db/audit";
import { createEmploymentRepository } from "@integration-api/services/employment/employment.repository";
import { createOrganizationRepository } from "@integration-api/services/organization/organization.repository";
import { createPositionRepository } from "@integration-api/services/position/position.repository";
import { createUserRepository } from "@integration-api/services/user/user.repository";

export function createIntegrationRepositories(client: DbClient) {
  return {
    audit: createAuditRepository(client),
    employment: createEmploymentRepository(client),
    organization: createOrganizationRepository(client),
    position: createPositionRepository(client),
    user: createUserRepository(client),
  };
}

export type IntegrationRepositories = ReturnType<typeof createIntegrationRepositories>;
