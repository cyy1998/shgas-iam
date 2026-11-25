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
import type { IntegrationRepositories } from "../repositories";
import { createIntegrationRepositories } from "../repositories";

export interface IntegrationTxPorts {
  repositories: IntegrationRepositories;
  subjectAccessMutation: Pick<SubjectAccessTransitionRepository, "runMutation">;
  userDocumentInvalidation: UserDocumentInvalidation;
  organizationDocumentInvalidation: OrganizationDocumentInvalidation;
  responsibilityParentLifecycle: OrganizationResponsibilityParentLifecycleGuard;
}

export interface CreateIntegrationUnitOfWorkOptions {
  db: DbClient;
  logger: AfterCommitLoggerPort;
  userDocumentJobProducer: CreateUserDocumentInvalidationDeps["jobProducer"];
  organizationDocumentJobProducer: CreateOrganizationDocumentInvalidationInput["jobProducer"];
  clock: { nowDate: () => Date };
}

export function createIntegrationUnitOfWork(
  options: CreateIntegrationUnitOfWorkOptions,
): UnitOfWorkPort<IntegrationTxPorts> {
  return createUnitOfWork<DbClient, IntegrationTxPorts>({
    db: options.db,
    logger: options.logger,
    createTxPorts: (tx, lifecycle) => {
      const repositories = createIntegrationRepositories(tx);
      return {
        repositories,
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
