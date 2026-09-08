import type { OrganizationResponsibilityAssignmentWriteTarget } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.type";
import type {
  SubjectAccessLifecycleRunInput,
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { EmploymentStatus, UserStatus } from "@iam/contracts";
import type { AuditActorType, AuditDetails, AuditOutcome } from "@iam/domain/audit";
import type { Employment } from "@iam/domain/employment";
import type { ResignUserOptions } from "./resign-user.type";

export type ResignUserProfileChange
  = | {
    readonly kind: "user";
    readonly userId: number;
  }
  | {
    readonly kind: "employment";
    readonly userId: number;
  }
  | {
    readonly kind: "organization-responsibility-assignment";
    readonly userId: number;
  };

export interface ResignUserTarget {
  id: number;
  subjectIdentifier: string;
  username: string;
  name?: string | null;
  status: UserStatus;
  isDelete: boolean;
}

export interface ResignUserEligibilityReaderPort {
  getUserByUsernameForAdmin: (username: string) => Promise<ResignUserTarget | null>;
  getUserByUsernameIncludingDeletedForAuthorization: (
    username: string,
  ) => Promise<ResignUserTarget | null>;
  getOpenEmploymentOrganizationIdsByUserId: (userId: number) => Promise<number[]>;
  getEndedEmploymentOrganizationIdsByUserId: (userId: number) => Promise<number[]>;
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
    getOpenEmploymentIdsByUserId: (userId: number) => Promise<number[]>;
    lockEmploymentsByIds: (ids: readonly number[]) => Promise<Employment[]>;
    updateEmploymentRecord: (id: number, patch: {
      status: EmploymentStatus.Disable;
      endTime: Date;
      isPrimary: false;
    }) => Promise<Employment>;

  };
  responsibilityParentLifecycle: {
    lockAssignmentsForEmployments: (input: {
      employmentIds: readonly number[];
      command: "end";
    }) => Promise<OrganizationResponsibilityAssignmentWriteTarget[]>;
    endOpenAssignmentsForUserResignation: (input: {
      userId: number;
      selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
      endTime: Date;
      auditContext?: ResignUserOptions["auditContext"];
    }) => Promise<boolean>;
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
  userStore: ResignUserEligibilityReaderPort & {
    lockUserByUsername: (username: string, includeDeleted?: boolean) => Promise<ResignUserTarget | null>;
    updateUserByUsername: (
      username: string,
      patch: { status: UserStatus },
    ) => Promise<ResignUserTarget | null>;
  };
}

export interface ResignUserClockPort {
  nowDate: () => Date;
}

export interface ResignUserSessionRevocationPort {
  prepareUserSessionRevocation: (input: {
    userId: number;
    subjectIdentifier: string;
    reason: "user_disabled";
    auditContext?: ResignUserOptions["auditContext"];
  }) => Promise<{
    revoke: (input: { onlySubjectAccessTransitionId?: string }) => Promise<unknown>;
  }>;
}

export interface ResignUserReaderPort extends ResignUserEligibilityReaderPort {}

export interface ResignUserSubjectAccessLifecyclePort {
  run: <Result>(input: SubjectAccessLifecycleRunInput<Result>) => Promise<Result>;
}

export interface ResignUserUseCaseDeps {
  clock: ResignUserClockPort;
  sessionRevocation: ResignUserSessionRevocationPort;
  subjectAccessLifecycle: ResignUserSubjectAccessLifecyclePort;
  uow: UnitOfWorkPort<ResignUserTransactionPorts>;
  userReader: ResignUserReaderPort;
}
