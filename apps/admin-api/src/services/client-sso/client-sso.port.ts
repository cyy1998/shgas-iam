import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { AdminClientMutationLoggerPort, AdminClientRuntimeInvalidationPort } from "@admin-api/services/client/client.port";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { ClientSsoAdminDtoSchema } from "@iam/domain/client";
import type { z } from "zod";
import type { ClientSsoRecord, ClientSsoStorageUpdate } from "./client-sso.type";

export interface ClientSsoRepositoryPort {
  getDetail: (clientCode: string) => Promise<z.infer<typeof ClientSsoAdminDtoSchema> | null>;
  get: (clientCode: string) => Promise<ClientSsoRecord | null>;
  lock: (clientCode: string, includeDeleted?: boolean) => Promise<ClientSsoRecord | null>;
  update: (clientCode: string, patch: ClientSsoStorageUpdate) => Promise<ClientSsoRecord | null>;
}
export interface ClientSsoTransactionPorts {
  client: ClientSsoRepositoryPort;
  audit: { recordAuditLog: (input: AuditLogInput) => Promise<void> };
}
export interface ClientSsoServiceDeps {
  sessionTermination?: { revokeClientSessions: (clientCode: string) => Promise<unknown> };
  client: ClientSsoRepositoryPort;
  uow: UnitOfWorkPort<ClientSsoTransactionPorts>;
  invalidation: AdminClientRuntimeInvalidationPort;
  logger: AdminClientMutationLoggerPort;
  credentials: { create: () => { secret: string; id: string; updatedAt: string } };
}
