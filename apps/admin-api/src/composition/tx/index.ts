import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createOrganizationResponsibilityParentLifecycleParticipant } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.participant";
import type { DbClient } from "@iam/db";
import {
  type CreateOrganizationDocumentInvalidationInput,
  createOrganizationDocumentInvalidation,
  type OrganizationDocumentInvalidation,
} from "@iam/organization-document/producer";
import type { AfterCommitLoggerPort, UnitOfWorkPort } from "@iam/unit-of-work";
import { createUnitOfWork } from "@iam/unit-of-work";
import type { CreateUserDocumentInvalidationDeps, UserDocumentInvalidation } from "@iam/user-document/producer";
import { createUserDocumentInvalidation } from "@iam/user-document/producer";
import type { SubjectAccessTransitionRepository } from "@iam/user-document/subject-access-transition";
import { createSubjectAccessTransitionRepository } from "@iam/user-document/subject-access-transition";
import type { AdminApiRepositories } from "../repositories";
import { createAdminApiRepositories } from "../repositories";
import type { ClockPort } from "../runtime";

export interface AdminApiTxPorts {
  repositories: AdminApiRepositories;
  auditService: AdminAuditService;
  responsibilityParentLifecycle: ReturnType<typeof createOrganizationResponsibilityParentLifecycleParticipant>;
  subjectAccessMutation: Pick<SubjectAccessTransitionRepository, "runMutation">;
  userDocumentInvalidation: UserDocumentInvalidation;
  organizationDocumentInvalidation: OrganizationDocumentInvalidation;
}

export interface CreateAdminApiUnitOfWorkOptions {
  db: DbClient;
  logger: AfterCommitLoggerPort;
  userDocumentJobProducer: CreateUserDocumentInvalidationDeps["jobProducer"];
  organizationDocumentJobProducer: CreateOrganizationDocumentInvalidationInput["jobProducer"];
  clock: Pick<ClockPort, "nowDate">;
}

export function createAdminApiUnitOfWork(options: CreateAdminApiUnitOfWorkOptions): UnitOfWorkPort<AdminApiTxPorts> {
  return createUnitOfWork<DbClient, AdminApiTxPorts>({
    db: options.db,
    logger: options.logger,
    createTxPorts: (tx, lifecycle) => {
      const repositories = createAdminApiRepositories(tx);
      const auditService = createAdminAuditService({ auditRepository: repositories.audit });
      const responsibilityParentLifecycle = createOrganizationResponsibilityParentLifecycleParticipant({
        assignmentStore: repositories.organizationResponsibility,
        auditLogWriter: auditService,
      });
      const subjectAccessMutation = createSubjectAccessTransitionRepository(tx);
      const userDocumentInvalidation = createUserDocumentInvalidation({
        db: tx,
        jobProducer: options.userDocumentJobProducer,
        lifecycle,
        clock: options.clock,
      });
      return {
        repositories,
        auditService,
        responsibilityParentLifecycle,
        subjectAccessMutation,
        userDocumentInvalidation,
        organizationDocumentInvalidation: createOrganizationDocumentInvalidation({
          db: tx,
          jobProducer: options.organizationDocumentJobProducer,
          lifecycle,
          clock: options.clock,
        }),
      };
    },
  });
}

export type { UnitOfWorkPort } from "@iam/unit-of-work";
