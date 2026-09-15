import type { ClientSsoServiceDeps } from "@admin-api/services/client-sso/client-sso.port";
import type { AfterCommitLoggerPort } from "@iam/api-core/uow";
import type { DbClient } from "@iam/db";
import { randomBytes, randomUUID } from "node:crypto";
import { createClientSsoAdapter } from "@admin-api/routes/admin/client-sso/client-sso.adapter";
import { createAuditRepository } from "@admin-api/services/audit/audit.repository";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createClientSsoRepository } from "@admin-api/services/client-sso/client-sso.repository";
import { createClientSsoService } from "@admin-api/services/client-sso/client-sso.service";
import { createUnitOfWork } from "@iam/api-core/uow";

export function createClientSsoManagement(options: {
  db: DbClient;
  logger: AfterCommitLoggerPort;
  invalidation: ClientSsoServiceDeps["invalidation"];
  callback: ClientSsoServiceDeps["callback"];
  sessionTermination?: ClientSsoServiceDeps["sessionTermination"];
}) {
  const service = createClientSsoService({
    sessionTermination: options.sessionTermination,
    client: createClientSsoRepository(options.db),
    uow: createUnitOfWork({
      db: options.db,
      logger: options.logger,
      createTxPorts: tx => ({
        client: createClientSsoRepository(tx),
        audit: createAdminAuditService({ auditRepository: createAuditRepository(tx) }),
      }),
    }),
    invalidation: options.invalidation,
    callback: options.callback,
    logger: options.logger,
    credentials: { create: () => ({ secret: randomBytes(32).toString("base64url"), id: randomUUID(), updatedAt: new Date().toISOString() }) },
  });
  return { service, ...createClientSsoAdapter(service) };
}
