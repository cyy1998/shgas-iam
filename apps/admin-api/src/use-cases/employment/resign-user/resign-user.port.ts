import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserStatus } from "@iam/contracts";
import type { AuditActorType, AuditDetails, AuditOutcome } from "@iam/domain/audit";
import type { ResignUserOptions } from "./resign-user.type";

export type ResignUserProfileChange
  = | {
    readonly kind: "user";
    readonly userId: number;
  }
  | {
    readonly kind: "employment";
    readonly userId: number;
  };

export interface ResignUserTarget {
  id: number;
  username: string;
  name?: string | null;
}

export interface ResignUserAuditInput {
  eventTime?: Date;
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorUserId?: number | null;
  actorName?: string | null;
  actorUsername?: string | null;
  actorClientCode?: string | null;
  actorSystemKey?: string | null;
  targetType: string;
  targetId?: number | null;
  targetCode?: string | null;
  targetName?: string | null;
  sourceApp?: string;
  requestId?: string | null;
  traceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  route?: string | null;
  method?: string | null;
  details?: AuditDetails;
}

export interface ResignUserTransactionPorts {
  auditLogWriter: {
    recordAuditLog: (input: ResignUserAuditInput) => Promise<void>;
  };
  employmentStore: {
    endActiveEmploymentsByUserId: (userId: number) => Promise<unknown>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly ResignUserProfileChange[]) => Promise<void>;
  };
  userStore: {
    getUserByUsernameForAdmin: (username: string) => Promise<ResignUserTarget | null>;
    updateUserByUsername: (username: string, patch: { status: UserStatus }) => Promise<unknown>;
  };
}

export interface ResignUserSessionRevocationPort {
  revokeUserSessions: (input: {
    userId: number;
    reason: "user_disabled";
    auditContext?: ResignUserOptions["auditContext"];
  }) => Promise<unknown>;
}

export interface ResignUserUseCaseDeps {
  sessionRevocation: ResignUserSessionRevocationPort;
  uow: UnitOfWorkPort<ResignUserTransactionPorts>;
}
