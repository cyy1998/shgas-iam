import type { DbClient } from "@iam/db";
import { createAuditLogWriter } from "@iam/db/audit";
import { type CreateUserDocumentInvalidationDeps, createUserDocumentInvalidation } from "@iam/documents/user/producer";
import { createSubjectAccessTransitionRepository } from "@iam/documents/user/subject-access-transition";
import type { AfterCommitLoggerPort } from "@iam/unit-of-work";
import { createUnitOfWork } from "@iam/unit-of-work";
import { createAuthApiRepositories } from "../repositories";
import type { ClockPort } from "../runtime";

export function createAuthApiUnitOfWork(options: {
  db: DbClient;
  logger: AfterCommitLoggerPort;
  userDocumentJobProducer: CreateUserDocumentInvalidationDeps["jobProducer"];
  clock: Pick<ClockPort, "nowDate">;
}) {
  return createUnitOfWork({
    db: options.db,
    logger: options.logger,
    createTxPorts: (tx, lifecycle) => {
      const repositories = createAuthApiRepositories(tx);
      return {
        repositories,
        auditLogWriter: createAuditLogWriter({ sourceApp: "auth-api", auditRepository: repositories.audit }),
        subjectAccessMutation: createSubjectAccessTransitionRepository(tx),
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
