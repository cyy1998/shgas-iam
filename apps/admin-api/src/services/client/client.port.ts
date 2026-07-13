import type {
  ClientCachePort,
  PasswordHasherPort,
  RandomPort,
} from "@admin-api/composition/runtime";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
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
  getClientById: (id: number) => Promise<AdminClientRecord | null>;
  createClient: (input: ClientCreateDto) => Promise<AdminClientRecord>;
  updateClientByCode: (clientCode: string, input: ClientUpdateDto) => Promise<AdminClientRecord>;
  updateClientByCodeWithOidcVersion: (
    clientCode: string,
    input: ClientUpdateDto,
  ) => Promise<AdminClientRecord>;
  updateClientById: (input: ClientInputDto) => Promise<AdminClientRecord>;
  updateClientByIdWithOidcVersion: (input: ClientInputDto) => Promise<AdminClientRecord>;
  updateClientOidcByCode: (
    clientCode: string,
    input: AdminClientOidcUpdate,
  ) => Promise<AdminClientRecord>;
  softDeleteClientByCode: (clientCode: string) => Promise<AdminClientRecord>;
}

export interface AdminClientTransactionPorts {
  clientRepository: AdminClientTransactionStorePort;
  auditService: AuditLogWriterPort;
}

export type AdminClientUnitOfWorkPort = UnitOfWorkPort<AdminClientTransactionPorts>;

export interface AdminClientServiceDeps {
  clientRepository: AdminClientReaderPort;
  clientCache: ClientCachePort;
  sessionRevocation: Pick<AdminSessionRevocationPort, "revokeClientProtocol" | "revokeClientAllProtocols">;
  passwordHasher: Pick<PasswordHasherPort, "hashSecret">;
  random: Pick<RandomPort, "oidcClientSecret">;
  uow: AdminClientUnitOfWorkPort;
}
