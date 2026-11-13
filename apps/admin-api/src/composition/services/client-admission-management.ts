import { createAuditRepository } from "@admin-api/services/audit/audit.repository";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import type { AdminClientRuntimeInvalidationPort } from "@admin-api/services/client/client.port";
import { createClientAdmissionRepository } from "@admin-api/services/client-admission/client-admission.repository";
import { createClientAdmissionService } from "@admin-api/services/client-admission/client-admission.service";
import type { DbClient } from "@iam/db";
import { createApplicationAdmissionEvaluator } from "@iam/documents/user/admission";
import type { AfterCommitLoggerPort } from "@iam/unit-of-work";
import { createUnitOfWork } from "@iam/unit-of-work";

export function createClientAdmissionManagement(options: {
  db: DbClient;
  adminClientCodes: readonly string[];
  invalidation: AdminClientRuntimeInvalidationPort;
  logger: AfterCommitLoggerPort;
}) {
  const repository = createClientAdmissionRepository(options.db);
  return createClientAdmissionService({
    ...options,
    client: repository,
    users: repository,
    evaluator: createApplicationAdmissionEvaluator(options.db),
    uow: createUnitOfWork({
      db: options.db,
      logger: options.logger,
      createTxPorts: (tx) => ({
        client: createClientAdmissionRepository(tx),
        audit: createAdminAuditService({ auditRepository: createAuditRepository(tx) }),
      }),
    }),
  });
}
