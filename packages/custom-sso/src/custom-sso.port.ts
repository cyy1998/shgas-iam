import type { SubjectAccessOperation, SubjectAccessPermission } from "@iam/api-core/subject-access";
import type { AuditActorType, AuditDetails, AuditOutcome, AuditRequestContext } from "@iam/domain/audit";

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

export interface CustomSsoProjectionPermission {
  readonly operation: SubjectAccessOperation;
  readonly permission: SubjectAccessPermission;
}
