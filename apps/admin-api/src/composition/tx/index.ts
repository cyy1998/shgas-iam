import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { DbClient } from "@iam/db";
import type { UserProfileDirtyJobProducerPort, UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type { AdminApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort, ClockPort } from "../runtime";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createUnitOfWork } from "@iam/api-core/uow";
import db from "@iam/db";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { createUserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import { createAdminApiRepositories } from "../repositories";

export interface AdminApiTxPorts {
  repositories: AdminApiRepositories;
  auditService: AdminAuditService;
  profileDirtyMarker: UserProfileDirtyMarker;
}

export interface CreateAdminApiUnitOfWorkOptions {
  logger: AfterCommitLoggerPort;
  userProfileJobProducer: UserProfileDirtyJobProducerPort;
  clock: Pick<ClockPort, "nowDate">;
}

export function createAdminApiUnitOfWork(
  options: CreateAdminApiUnitOfWorkOptions,
): UnitOfWorkPort<AdminApiTxPorts> {
  return createUnitOfWork<DbClient, AdminApiTxPorts>({
    db,
    logger: options.logger,
    createTxPorts: (tx) => {
      const roleAssignmentResolver = createRoleAssignmentResolver(tx);
      const repositories = createAdminApiRepositories(tx, roleAssignmentResolver);
      return {
        repositories,
        auditService: createAdminAuditService({ auditRepository: repositories.audit }),
        profileDirtyMarker: createUserProfileDirtyMarker({
          dirtyRepository: repositories.userProfileDirty,
          scopeRepository: repositories.userProfileScope,
          jobProducer: options.userProfileJobProducer,
          clock: options.clock,
        }),
      };
    },
  });
}

export type { UnitOfWorkPort } from "@iam/api-core/uow";
