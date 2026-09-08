import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { DbClient } from "@iam/db";
import type {
  CreateUserProfileInvalidationDeps,
  UserProfileInvalidation,
} from "@iam/user-profile-read-model/producer";
import type { SubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import type { ApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort, ClockPort } from "../runtime";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createUnitOfWork } from "@iam/api-core/uow";
import { createUserProfileInvalidation } from "@iam/user-profile-read-model/producer";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import { createApiRepositories } from "../repositories";

export interface ApiTxPorts {
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
  subjectAccessMutation: Pick<SubjectAccessTransitionRepository, "runMutation">;
  userProfileInvalidation: UserProfileInvalidation;
}

export interface CreateApiUnitOfWorkOptions {
  db: DbClient;
  logger: AfterCommitLoggerPort;
  userProfileJobProducer: CreateUserProfileInvalidationDeps["jobProducer"];
  clock: Pick<ClockPort, "nowDate">;
}

export function createApiUnitOfWork(options: CreateApiUnitOfWorkOptions): UnitOfWorkPort<ApiTxPorts> {
  return createUnitOfWork<DbClient, ApiTxPorts>({
    db: options.db,
    logger: options.logger,
    createTxPorts: (tx, lifecycle) => {
      const repositories = createApiRepositories(tx);
      return {
        repositories,
        auditLogWriter: createApiAuditLogWriter({ auditRepository: repositories.audit }),
        subjectAccessMutation: createSubjectAccessTransitionRepository(tx),
        userProfileInvalidation: createUserProfileInvalidation({
          db: tx,
          jobProducer: options.userProfileJobProducer,
          lifecycle,
          clock: options.clock,
        }),
      };
    },
  });
}

export type { UnitOfWorkPort } from "@iam/api-core/uow";
