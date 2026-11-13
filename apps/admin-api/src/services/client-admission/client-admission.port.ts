import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type {
  AdminClientMutationLoggerPort,
  AdminClientRuntimeInvalidationPort,
} from "@admin-api/services/client/client.port";
import type { ApplicationAdmissionInput, ApplicationAdmissionResult } from "@iam/contracts";
import type { UserDocumentFilter } from "@iam/documents/user/document/query";
import type { UnitOfWorkPort } from "@iam/unit-of-work";

interface ClientAdmissionRecord {
  id: number;
  clientCode: string;
  clientName: string;
  enabled: boolean;
  filter: unknown;
}

export interface ClientAdmissionReadPort {
  get(clientCode: string): Promise<ClientAdmissionRecord | null>;
}

export interface ClientAdmissionEvaluatorPort {
  evaluate(input: ApplicationAdmissionInput): Promise<ApplicationAdmissionResult>;
}

export interface ClientAdmissionTransactionPorts {
  client: {
    lock(clientCode: string): Promise<ClientAdmissionRecord | null>;
    save(clientCode: string, filter: UserDocumentFilter): Promise<boolean>;
    setEnabled(clientCode: string, enabled: boolean): Promise<boolean>;
  };
  audit: { recordAuditLog(input: AuditLogInput): Promise<void> };
}

export interface ClientAdmissionServiceDeps {
  client: ClientAdmissionReadPort;
  users: { findSubjectIdentifier(userId: number): Promise<string | null> };
  evaluator: ClientAdmissionEvaluatorPort;
  adminClientCodes: readonly string[];
  invalidation: AdminClientRuntimeInvalidationPort;
  logger: AdminClientMutationLoggerPort;
  uow: UnitOfWorkPort<ClientAdmissionTransactionPorts>;
}
