import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { DbClient } from "@iam/db";
import type { UserProfileDirtyJobProducerPort, UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import type { ApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort, ClockPort } from "../runtime";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createUnitOfWork } from "@iam/api-core/uow";
import db from "@iam/db";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { createUserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";
import { createApiRepositories } from "../repositories";

export interface ApiTxPorts {
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
  profileDirtyMarker: UserProfileDirtyMarker;
}

export interface CreateApiUnitOfWorkOptions {
  logger: AfterCommitLoggerPort;
  userProfileJobProducer: UserProfileDirtyJobProducerPort;
  clock: Pick<ClockPort, "nowDate">;
}

export function createApiUnitOfWork(options: CreateApiUnitOfWorkOptions): UnitOfWorkPort<ApiTxPorts> {
  return createUnitOfWork<DbClient, ApiTxPorts>({
    db,
    logger: options.logger,
    createTxPorts: (tx) => {
      const roleAssignmentResolver = createRoleAssignmentResolver(tx);
      const repositories = createApiRepositories(tx, roleAssignmentResolver);
      return {
        repositories,
        auditLogWriter: createApiAuditLogWriter({ auditRepository: repositories.audit }),
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
