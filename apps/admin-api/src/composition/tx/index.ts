import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type { AdminApiRepositories } from "../repositories";
import type { AfterCommitLoggerPort } from "../runtime";
import type { UnitOfWork } from "./unit-of-work";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import db from "@iam/db";
import { createAdminApiRepositories } from "../repositories";
import { createUnitOfWork } from "./unit-of-work";

export interface AdminApiRootPorts {
  repositories: AdminApiRepositories;
  auditService: AdminAuditService;
}

export interface AdminApiTxPorts {
  repositories: AdminApiRepositories;
  auditService: AdminAuditService;
}

export interface CreateAdminApiUnitOfWorkOptions {
  logger: AfterCommitLoggerPort;
  rootPorts: AdminApiRootPorts;
}

export function createAdminApiUnitOfWork(
  options: CreateAdminApiUnitOfWorkOptions,
): UnitOfWork<AdminApiTxPorts, AdminApiRootPorts> {
  return createUnitOfWork({
    db,
    logger: options.logger,
    rootPorts: options.rootPorts,
    createTxPorts: (tx) => {
      const repositories = createAdminApiRepositories(tx);
      return {
        repositories,
        auditService: createAdminAuditService({ auditRepository: repositories.audit }),
      };
    },
  });
}

export * from "./unit-of-work";
