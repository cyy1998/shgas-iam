import type {
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
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
  subjectIdentifier: string;
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
    endOpenEmploymentsByUserId: (userId: number, endTime: Date) => Promise<unknown>;
  };
  subjectAccessMutation: {
    runMutation: <T>(
      receipt: SubjectAccessMutationReceipt,
      mutation: () => Promise<T>,
      resolveTarget: (result: T) => SubjectAccessTransitionTarget,
    ) => Promise<T>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly ResignUserProfileChange[]) => Promise<void>;
  };
  userStore: {
    getUserByUsernameForAdmin: (username: string) => Promise<ResignUserTarget | null>;
    updateUserByUsername: (username: string, patch: { status: UserStatus }) => Promise<unknown>;
  };
}

export interface ResignUserClockPort {
  nowDate: () => Date;
}

export interface ResignUserSessionRevocationPort {
  revokeUserSessions: (input: {
    userId: number;
    subjectIdentifier: string;
    reason: "user_disabled";
    onlySubjectAccessTransitionId?: string;
    auditContext?: ResignUserOptions["auditContext"];
  }) => Promise<unknown>;
}

export interface ResignUserReaderPort {
  getUserByUsernameForAdmin: (username: string) => Promise<ResignUserTarget | null>;
}

export interface ResignUserSubjectAccessLifecyclePort {
  run: (input: {
    subjectIdentifier: string;
    disposition: "disabled";
    mutate: (receipt: SubjectAccessMutationReceipt) => Promise<true>;
    revokeSessions: (
      result: true,
      context: {
        invalidatedSubjectAccessTransitionId: string;
      },
    ) => Promise<unknown>;
    observability?: {
      requestId?: string;
      traceId?: string;
    };
  }) => Promise<true>;
}

export interface ResignUserUseCaseDeps {
  clock: ResignUserClockPort;
  sessionRevocation: ResignUserSessionRevocationPort;
  subjectAccessLifecycle: ResignUserSubjectAccessLifecyclePort;
  uow: UnitOfWorkPort<ResignUserTransactionPorts>;
  userReader: ResignUserReaderPort;
}
