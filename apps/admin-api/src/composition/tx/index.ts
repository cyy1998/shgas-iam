import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { DbClient } from "@iam/db";
import type {
  CreateUserProfileInvalidationDeps,
  UserProfileInvalidation,
} from "@iam/user-profile-read-model/producer";
import type { SubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import type { AdminApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort, ClockPort } from "../runtime";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createUnitOfWork } from "@iam/api-core/uow";
import db from "@iam/db";
import { createUserProfileInvalidation } from "@iam/user-profile-read-model/producer";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import { createAdminApiRepositories } from "../repositories";

export interface AdminApiTxPorts {
  repositories: AdminApiRepositories;
  auditService: AdminAuditService;
  subjectAccessMutation: Pick<SubjectAccessTransitionRepository, "runMutation">;
  userProfileInvalidation: UserProfileInvalidation;
}

export interface CreateAdminApiUnitOfWorkOptions {
  logger: AfterCommitLoggerPort;
  userProfileJobProducer: CreateUserProfileInvalidationDeps["jobProducer"];
  clock: Pick<ClockPort, "nowDate">;
}

export function createAdminApiUnitOfWork(
  options: CreateAdminApiUnitOfWorkOptions,
): UnitOfWorkPort<AdminApiTxPorts> {
  return createUnitOfWork<DbClient, AdminApiTxPorts>({
    db,
    logger: options.logger,
    createTxPorts: (tx, lifecycle) => {
      const repositories = createAdminApiRepositories(tx);
      return {
        repositories,
        auditService: createAdminAuditService({ auditRepository: repositories.audit }),
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
