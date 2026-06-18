import type {
  ClientCachePort,
  LoggerPort,
  OidcInvalidationPort,
  PasswordHasherPort,
  RandomPort,
} from "@admin-api/composition/runtime";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { ClientRepository } from "./client.repository";

export interface AdminClientTransactionPorts {
  clientRepository: Pick<
    ClientRepository,
    | "getAnyClientByCode"
    | "getClientByCode"
    | "getClientById"
    | "createClient"
    | "updateClientByCode"
    | "updateClientByCodeWithOidcVersion"
    | "updateClientById"
    | "updateClientByIdWithOidcVersion"
    | "updateClientOidcByCode"
    | "softDeleteClientByCode"
  >;
  auditService: AuditLogWriterPort;
}

export interface AdminClientUnitOfWorkPort {
  transaction: <T>(callback: (tx: AdminClientTransactionPorts) => Promise<T>) => Promise<T>;
}

export interface AdminClientServiceDeps {
  clientRepository: Pick<ClientRepository, "searchClientsPaged" | "getClientByCode">;
  clientCache: ClientCachePort;
  oidcInvalidation: OidcInvalidationPort;
  logger: Pick<LoggerPort, "warn">;
  passwordHasher: Pick<PasswordHasherPort, "hashSecret">;
  random: Pick<RandomPort, "oidcClientSecret">;
  uow: AdminClientUnitOfWorkPort;
}
