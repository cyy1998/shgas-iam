import type {
  ClientCachePort,
  PasswordHasherPort,
  RandomPort,
} from "@admin-api/composition/runtime";
import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
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

export type AdminClientUnitOfWorkPort = UnitOfWorkPort<AdminClientTransactionPorts>;

export interface AdminClientServiceDeps {
  clientRepository: Pick<ClientRepository, "searchClientsPaged" | "getClientByCode">;
  clientCache: ClientCachePort;
  sessionRevocation: Pick<AdminSessionRevocationPort, "revokeClientProtocol" | "revokeClientAllProtocols">;
  passwordHasher: Pick<PasswordHasherPort, "hashSecret">;
  random: Pick<RandomPort, "oidcClientSecret">;
  uow: AdminClientUnitOfWorkPort;
}
