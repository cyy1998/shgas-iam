import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type {
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserCreateDto } from "@iam/domain/user";

export type RegisterPurveyorContactProfileChange
  = | {
    readonly kind: "user";
    readonly userId: number;
  }
  | {
    readonly kind: "employment";
    readonly userId: number;
  };

export interface RegisterPurveyorEmploymentStorePort {
  getEmploymentByUserOrgPosId: (
    userId: number,
    orgId: number,
    posId: number,
  ) => Promise<unknown | null>;
  setEmployment: (userId: number, posId: number, orgId: number) => Promise<unknown>;
}

export interface RegisterPurveyorOrganizationReaderPort {
  getOrganizationByCode: (orgCode: string) => Promise<{ id: number } | null>;
}

export interface RegisterPurveyorPositionReaderPort {
  getPositionByCode: (posCode: string) => Promise<{ id: number } | null>;
}

export interface RegisterPurveyorUserStorePort {
  lockPurveyorContactMobile: (mobile: string) => Promise<void>;
  getUserByMobile: (mobile: string) => Promise<{ id: number } | null>;
  setUser: (input: UserCreateDto & { subjectIdentifier: string }) => Promise<{ id: number }>;
}

export interface RegisterPurveyorMobilePort {
  getPurveyorWelcomeMessage: (name: string) => string;
  sendMessage: (phoneNumber: string, message: string) => Promise<boolean>;
}

export interface RegisterPurveyorContactTransactionPorts {
  employmentRepository: RegisterPurveyorEmploymentStorePort;
  organizationRepository: RegisterPurveyorOrganizationReaderPort;
  positionRepository: RegisterPurveyorPositionReaderPort;
  subjectAccessMutation: {
    runMutation: <T>(
      receipt: SubjectAccessMutationReceipt,
      mutation: () => Promise<T>,
      resolveTarget: (result: T) => SubjectAccessTransitionTarget,
    ) => Promise<T>;
  };
  userRepository: RegisterPurveyorUserStorePort;
  userProfileInvalidation: {
    recordChanges: (changes: readonly RegisterPurveyorContactProfileChange[]) => Promise<void>;
  };
}

export interface RegisterPurveyorContactUseCaseDeps {
  auditLogWriter: Pick<AuditLogWriterPort, "recordAuditLog">;
  config: {
    nodeEnv: string;
  };
  mobileService: RegisterPurveyorMobilePort;
  random: {
    uuid: () => string;
  };
  subjectAccessLifecycle: {
    run: <T>(input: {
      subjectIdentifier: string;
      disposition: "disabled" | "awaiting_publication";
      mutate: (receipt: SubjectAccessMutationReceipt) => Promise<T>;
      observability?: {
        requestId?: string;
        traceId?: string;
      };
    }) => Promise<T>;
  };
  uow: UnitOfWorkPort<RegisterPurveyorContactTransactionPorts>;
  userReader: {
    getActiveUserByMobile: (mobile: string) => Promise<{ id: number } | null>;
  };
}
