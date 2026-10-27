import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import { createUnitOfWork } from "@iam/api-core/uow";
import type { DbClient } from "@iam/db";
import {
  type CreateOrganizationDocumentInvalidationInput,
  createOrganizationDocumentInvalidation,
  type OrganizationDocumentInvalidation,
} from "@iam/organization-document/producer";
import {
  createOrganizationResponsibilityParentLifecycleGuard,
  createOrganizationResponsibilityParentLifecycleReader,
  type OrganizationResponsibilityParentLifecycleGuard,
} from "@iam/organization-responsibility-resolution/parent-lifecycle";
import type { CreateUserDocumentInvalidationDeps, UserDocumentInvalidation } from "@iam/user-document/producer";
import { createUserDocumentInvalidation } from "@iam/user-document/producer";
import type { SubjectAccessTransitionRepository } from "@iam/user-document/subject-access-transition";
import { createSubjectAccessTransitionRepository } from "@iam/user-document/subject-access-transition";
import type { ApiRepositories } from "../repositories";
import { createApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort, ClockPort } from "../runtime";

export interface ApiTxPorts {
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
  subjectAccessMutation: Pick<SubjectAccessTransitionRepository, "runMutation">;
  userDocumentInvalidation: UserDocumentInvalidation;
  organizationDocumentInvalidation: OrganizationDocumentInvalidation;
  responsibilityParentLifecycle: OrganizationResponsibilityParentLifecycleGuard;
}

export interface CreateApiUnitOfWorkOptions {
  db: DbClient;
  logger: AfterCommitLoggerPort;
  userDocumentJobProducer: CreateUserDocumentInvalidationDeps["jobProducer"];
  organizationDocumentJobProducer: CreateOrganizationDocumentInvalidationInput["jobProducer"];
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
        responsibilityParentLifecycle: createOrganizationResponsibilityParentLifecycleGuard(
          createOrganizationResponsibilityParentLifecycleReader(tx),
        ),
        organizationDocumentInvalidation: createOrganizationDocumentInvalidation({
          db: tx,
          jobProducer: options.organizationDocumentJobProducer,
          lifecycle,
          clock: options.clock,
        }),
        userDocumentInvalidation: createUserDocumentInvalidation({
          db: tx,
          jobProducer: options.userDocumentJobProducer,
          lifecycle,
          clock: options.clock,
        }),
      };
    },
  });
}

export type { UnitOfWorkPort } from "@iam/api-core/uow";
