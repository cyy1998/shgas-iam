import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { ApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort } from "../runtime";
import type { UnitOfWork } from "./unit-of-work";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import db from "@iam/db";
import { createApiRepositories } from "../repositories";
import { createUnitOfWork } from "./unit-of-work";

export interface ApiRootPorts {
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
}

export interface ApiTxPorts {
  repositories: ApiRepositories;
  auditLogWriter: ApiAuditLogWriter;
}

export interface CreateApiUnitOfWorkOptions {
  logger: AfterCommitLoggerPort;
  rootPorts: ApiRootPorts;
}

export function createApiUnitOfWork(options: CreateApiUnitOfWorkOptions): UnitOfWork<ApiTxPorts, ApiRootPorts> {
  return createUnitOfWork({
    db,
    logger: options.logger,
    rootPorts: options.rootPorts,
    createTxPorts: (tx) => {
      const repositories = createApiRepositories(tx);
      return {
        repositories,
        auditLogWriter: createApiAuditLogWriter({ auditRepository: repositories.audit }),
      };
    },
  });
}

export * from "./unit-of-work";
