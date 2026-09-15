import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  AdminClientRecord,
  ClientCreateDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";

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
  lockClientById: (id: number) => Promise<AdminClientRecord | null>;
  createClient: (input: ClientCreateDto) => Promise<AdminClientRecord | null>;
  updateClientByCode: (clientCode: string, input: ClientUpdateDto) => Promise<AdminClientRecord | null>;

}

export interface AdminClientTransactionPorts {
  clientRepository: AdminClientTransactionStorePort;
  auditService: AuditLogWriterPort;
}

export type AdminClientUnitOfWorkPort = UnitOfWorkPort<AdminClientTransactionPorts>;

export interface AdminClientCacheInvalidationTarget {
  clientCode: string;
  clientSecret: string;
}

export interface AdminClientRuntimeInvalidationPort {
  invalidateClient: (clientCode: string) => Promise<unknown>;
}

export interface AdminClientMutationLoggerPort {
  error: (fields: Record<string, unknown>, message: string) => void;
}

export interface AdminClientCachePort {
  invalidateClient: (
    client: AdminClientCacheInvalidationTarget,
  ) => Promise<unknown>;
  invalidateUpdatedClient: (
    oldClient: AdminClientCacheInvalidationTarget,
    newClient: AdminClientCacheInvalidationTarget,
  ) => Promise<unknown>;
}

export interface AdminClientSecretHasherPort {
  hashSecret: (secret: string) => Promise<string>;
}

export interface AdminClientSecretGeneratorPort {
  customSsoClientSecret: () => string;
  oidcClientSecret: () => string;
}

export interface AdminClientServiceDeps {
  clientRepository: AdminClientReaderPort;
  clientCache: AdminClientCachePort;
  clientRuntimeInvalidation: AdminClientRuntimeInvalidationPort;
  clientMutationLogger: AdminClientMutationLoggerPort;
  management: {
    save: (clientCode: string, data: Pick<ClientUpdateDto, "clientName" | "url" | "status" | "description">, auditContext?: AdminAuditContext) => Promise<{ changed: boolean }>;
    deleteClient: (clientCode: string, auditContext?: AdminAuditContext) => Promise<{ changed: boolean; result: null }>;
  };
  passwordHasher: AdminClientSecretHasherPort;
  random: AdminClientSecretGeneratorPort;
  uow: AdminClientUnitOfWorkPort;
}
