import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { GenericClientCacheIdentity } from "@iam/client-snapshot/generic-cache";
import type { UnitOfWorkPort } from "@iam/unit-of-work";
import type { AdminClientRecord, ClientCreateDto, ClientPaginationQueryDto, ClientUpdateDto } from "./client.type";

export interface AdminClientReaderPort {
  searchClientsPaged: (query: ClientPaginationQueryDto) => Promise<{
    rows: AdminClientRecord[];
    total: number;
  }>;
  getClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
  getClientById: (id: number) => Promise<AdminClientRecord | null>;
}

export interface AdminClientTransactionStorePort {
  getAnyClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
  getClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
  lockClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
  createClient: (input: ClientCreateDto) => Promise<AdminClientRecord | null>;
  updateClientByCode: (clientCode: string, input: ClientUpdateDto) => Promise<AdminClientRecord | null>;
}

export interface AdminClientTransactionPorts {
  clientRepository: AdminClientTransactionStorePort;
  auditService: AuditLogWriterPort;
}

export type AdminClientUnitOfWorkPort = UnitOfWorkPort<AdminClientTransactionPorts>;

export interface AdminClientRuntimeInvalidationPort {
  invalidateClient: (clientCode: string) => Promise<unknown>;
}

export interface AdminClientMutationLoggerPort {
  error: (fields: Record<string, unknown>, message: string) => void;
}

export interface AdminClientCachePort {
  invalidateClient: (client: GenericClientCacheIdentity) => Promise<unknown>;
  invalidateUpdatedClient: (
    oldClient: GenericClientCacheIdentity,
    newClient: GenericClientCacheIdentity,
  ) => Promise<unknown>;
}

export interface AdminClientServiceDeps {
  clientRepository: AdminClientReaderPort;
  clientCache: AdminClientCachePort;
  clientRuntimeInvalidation: AdminClientRuntimeInvalidationPort;
  clientMutationLogger: AdminClientMutationLoggerPort;
  management: {
    save: (
      clientCode: string,
      data: Pick<ClientUpdateDto, "clientName" | "url" | "status" | "description">,
      auditContext?: AdminAuditContext,
    ) => Promise<{ changed: boolean }>;
    deleteClient: (clientCode: string, auditContext?: AdminAuditContext) => Promise<{ changed: boolean; result: null }>;
  };
  uow: AdminClientUnitOfWorkPort;
}
