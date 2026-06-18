import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { DbClient } from "@iam/db";
import type { AdminApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort } from "../runtime";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createUnitOfWork } from "@iam/api-core/uow";
import db from "@iam/db";
import { createAdminApiRepositories } from "../repositories";

export interface AdminApiTxPorts {
  repositories: AdminApiRepositories;
  auditService: AdminAuditService;
}

export interface CreateAdminApiUnitOfWorkOptions {
  logger: AfterCommitLoggerPort;
}

export function createAdminApiUnitOfWork(
  options: CreateAdminApiUnitOfWorkOptions,
): UnitOfWorkPort<AdminApiTxPorts> {
  return createUnitOfWork<DbClient, AdminApiTxPorts>({
    db,
    logger: options.logger,
    createTxPorts: (tx) => {
      const repositories = createAdminApiRepositories(tx);
      return {
        repositories,
        auditService: createAdminAuditService({ auditRepository: repositories.audit }),
      };
    },
  });
}

export type { UnitOfWorkPort } from "@iam/api-core/uow";
