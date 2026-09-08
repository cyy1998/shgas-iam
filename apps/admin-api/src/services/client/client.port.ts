import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  AdminClientCustomSsoUpdate,
  AdminClientOidcUpdate,
  AdminClientRecord,
  ClientCreateDto,
  ClientInputDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";

export interface AdminClientReaderPort {
  searchClientsPaged: (query: ClientPaginationQueryDto) => Promise<{
    rows: AdminClientRecord[];
    total: number;
  }>;
  getClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
}

export interface AdminClientTransactionStorePort {
  getAnyClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
  getClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
  lockClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
  lockClientById: (id: number) => Promise<AdminClientRecord | null>;
  createClient: (input: ClientCreateDto) => Promise<AdminClientRecord | null>;
  updateClientByCode: (clientCode: string, input: ClientUpdateDto) => Promise<AdminClientRecord | null>;
  updateClientByCodeWithProtocolEpochs: (
    clientCode: string,
    input: ClientUpdateDto,
  ) => Promise<AdminClientRecord | null>;
  updateClientById: (input: ClientInputDto) => Promise<AdminClientRecord | null>;
  updateClientByIdWithProtocolEpochs: (
    input: ClientInputDto,
  ) => Promise<AdminClientRecord | null>;
  updateClientOidcByCode: (
    clientCode: string,
    input: AdminClientOidcUpdate,
  ) => Promise<AdminClientRecord>;
  updateClientCustomSsoByCode: (
    clientCode: string,
    input: AdminClientCustomSsoUpdate,
  ) => Promise<AdminClientRecord>;
  softDeleteClientByCode: (clientCode: string) => Promise<AdminClientRecord | null>;
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
  sessionRevocation: Pick<AdminSessionRevocationPort, "revokeClientProtocol" | "revokeClientAllProtocols">;
  passwordHasher: AdminClientSecretHasherPort;
  random: AdminClientSecretGeneratorPort;
  uow: AdminClientUnitOfWorkPort;
}
