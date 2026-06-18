import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { DbClient } from "@iam/db";
import type { ApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort } from "../runtime";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createUnitOfWork } from "@iam/api-core/uow";
import db from "@iam/db";
import { createApiRepositories } from "../repositories";

export interface ApiTxPorts {
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
}

export interface CreateApiUnitOfWorkOptions {
  logger: AfterCommitLoggerPort;
}

export function createApiUnitOfWork(options: CreateApiUnitOfWorkOptions): UnitOfWorkPort<ApiTxPorts> {
  return createUnitOfWork<DbClient, ApiTxPorts>({
    db,
    logger: options.logger,
    createTxPorts: (tx) => {
      const repositories = createApiRepositories(tx);
      return {
        repositories,
        auditLogWriter: createApiAuditLogWriter({ auditRepository: repositories.audit }),
      };
    },
  });
}

export type { UnitOfWorkPort } from "@iam/api-core/uow";
