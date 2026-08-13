import type { AuditLogWriterPort } from "@admin-api/services/audit/audit.service";
import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type {
  ClientTrafficGateMutation,
  ClientTrafficGateMutationHeartbeat,
} from "@iam/api-core/client-traffic-gate";
import type {
  CustomSsoClientRuntimeMutation,
  CustomSsoClientRuntimeMutationHeartbeat,
} from "@iam/api-core/custom-sso";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { ClientStatus } from "@iam/contracts";
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
  createClient: (input: ClientCreateDto) => Promise<AdminClientRecord>;
  updateClientByCode: (clientCode: string, input: ClientUpdateDto) => Promise<AdminClientRecord>;
  updateClientByCodeWithProtocolEpochs: (
    clientCode: string,
    input: ClientUpdateDto,
  ) => Promise<AdminClientRecord>;
  updateClientById: (input: ClientInputDto) => Promise<AdminClientRecord>;
  updateClientByIdWithProtocolEpochs: (
    input: ClientInputDto,
  ) => Promise<AdminClientRecord>;
  updateClientOidcByCode: (
    clientCode: string,
    input: AdminClientOidcUpdate,
  ) => Promise<AdminClientRecord>;
  updateClientCustomSsoByCode: (
    clientCode: string,
    input: AdminClientCustomSsoUpdate,
  ) => Promise<AdminClientRecord>;
  softDeleteClientByCode: (clientCode: string) => Promise<AdminClientRecord>;
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

export interface AdminClientCachePort {
  beginTrafficGateMutation: (
    clientCode: string,
    mutationId: string,
  ) => Promise<ClientTrafficGateMutation>;
  startTrafficGateMutationHeartbeat: (
    mutation: ClientTrafficGateMutation,
  ) => ClientTrafficGateMutationHeartbeat;
  publishTrafficGateMutation: (
    mutation: ClientTrafficGateMutation,
    status: ClientStatus,
  ) => Promise<"expired" | "published" | "superseded">;
  abortTrafficGateMutation: (
    mutation: ClientTrafficGateMutation,
  ) => Promise<"aborted" | "expired" | "superseded">;
  beginRuntimeMutation: (
    clientCode: string,
    mutationId: string,
  ) => Promise<CustomSsoClientRuntimeMutation>;
  startRuntimeMutationHeartbeat: (
    mutation: CustomSsoClientRuntimeMutation,
  ) => CustomSsoClientRuntimeMutationHeartbeat;
  completeRuntimeMutation: (
    mutation: CustomSsoClientRuntimeMutation,
  ) => Promise<"completed" | "expired" | "superseded">;
  abortRuntimeMutation: (
    mutation: CustomSsoClientRuntimeMutation,
  ) => Promise<"aborted" | "expired" | "superseded">;
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
  uuid: () => string;
  customSsoClientSecret: () => string;
  oidcClientSecret: () => string;
}

export interface AdminClientServiceDeps {
  clientRepository: AdminClientReaderPort;
  clientCache: AdminClientCachePort;
  sessionRevocation: Pick<AdminSessionRevocationPort, "revokeClientProtocol" | "revokeClientAllProtocols">;
  passwordHasher: AdminClientSecretHasherPort;
  random: AdminClientSecretGeneratorPort;
  uow: AdminClientUnitOfWorkPort;
}
