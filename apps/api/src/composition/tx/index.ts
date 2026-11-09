import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import {
  createOrganizationResponsibilityParentLifecycleGuard,
  createOrganizationResponsibilityParentLifecycleReader,
  type OrganizationResponsibilityParentLifecycleGuard,
} from "@iam/assignment-resolution/organization-responsibility/parent-lifecycle";
import type { DbClient } from "@iam/db";
import {
  type CreateOrganizationDocumentInvalidationInput,
  createOrganizationDocumentInvalidation,
  type OrganizationDocumentInvalidation,
} from "@iam/documents/organization/producer";
import type { CreateUserDocumentInvalidationDeps, UserDocumentInvalidation } from "@iam/documents/user/producer";
import { createUserDocumentInvalidation } from "@iam/documents/user/producer";
import type { SubjectAccessTransitionRepository } from "@iam/documents/user/subject-access-transition";
import { createSubjectAccessTransitionRepository } from "@iam/documents/user/subject-access-transition";
import type { AfterCommitLoggerPort, UnitOfWorkPort } from "@iam/unit-of-work";
import { createUnitOfWork } from "@iam/unit-of-work";
import type { ApiRepositories } from "../repositories";
import { createApiRepositories } from "../repositories";
import type { ClockPort } from "../runtime";

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

export type { UnitOfWorkPort } from "@iam/unit-of-work";
