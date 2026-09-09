import type { ClientTrafficGateResult } from "@iam/api-core/client-traffic-gate";
import type { AuditActorType, AuditDetails, AuditOutcome, AuditRequestContext } from "@iam/domain/audit";
import type { CustomSsoClientRuntimeDto, CustomSsoClientSecretRecord } from "@iam/domain/client";
import type { SessionKernel } from "@iam/session-kernel";
import type { CustomSsoSubjectProjectionPort } from "./subject-projection.port";

export interface CustomSsoLoggerPort {
  info: (fields: Record<string, unknown>, message: string) => void;
  warn: (fields: Record<string, unknown>, message: string) => void;
}

export type CustomSsoAuditInput = Partial<AuditRequestContext> & {
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorUserId?: number | null;
  targetType: string;
  targetId?: number | null;
  targetCode?: string | null;
  details?: AuditDetails;
};

export interface CustomSsoAuditPort {
  recordAuditLog: (input: CustomSsoAuditInput) => Promise<void>;
}

export interface CustomSsoOrcasUser {
  id: number;
  username: string;
  name: string;
  mobile?: string | null;
}

export interface CustomSsoOrcasPort {
  orcasLogin: (input: CustomSsoOrcasUser) => Promise<{ orcasSessionId: string; orcasId: string }>;
}

export type CustomSsoKernelPort = Pick<SessionKernel, | "createProtocolArtifact"
  | "consumeProtocolArtifact"
  | "issueCredential"
  | "renewPrincipalSession"
  | "resolveCredential"
  | "resolvePrincipalSession"
  | "resolvePrincipalSessionById"
  | "resolveProtocolArtifact"
  | "revokeCredential"
  | "revokeObservedObject"
  | "revokePrincipalSession">;

export interface CustomSsoDeps {
  kernel: CustomSsoKernelPort;
  clients: { findRuntimeRecord: (clientCode: string) => Promise<CustomSsoClientRuntimeDto | null> };
  clientSecrets: { findSecretRecord: (clientCode: string) => Promise<CustomSsoClientSecretRecord | null> };
  secrets: { verify: (secret: string, hash: string) => Promise<boolean> };
  traffic: { check: (clientCode: string) => Promise<ClientTrafficGateResult> };
  subjectProjection: CustomSsoSubjectProjectionPort;
  orcas: CustomSsoOrcasPort;
  auditLogWriter: CustomSsoAuditPort;
  logger: CustomSsoLoggerPort;
  random: { uuid: () => string };
  config: { authCodeExpireSeconds: number; localSessionTtlSeconds: number };
}
