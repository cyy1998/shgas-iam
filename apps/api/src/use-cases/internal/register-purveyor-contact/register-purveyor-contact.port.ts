import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserCreateDto } from "@iam/domain/user";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";

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
  getUserByMobile: (mobile: string) => Promise<{ id: number } | null>;
  setUser: (input: UserCreateDto) => Promise<{ id: number }>;
}

export interface RegisterPurveyorMobilePort {
  getPurveyorWelcomeMessage: (name: string) => string;
  sendMessage: (phoneNumber: string, message: string) => Promise<boolean>;
}

export interface RegisterPurveyorContactTransactionPorts {
  employmentRepository: RegisterPurveyorEmploymentStorePort;
  organizationRepository: RegisterPurveyorOrganizationReaderPort;
  positionRepository: RegisterPurveyorPositionReaderPort;
  userRepository: RegisterPurveyorUserStorePort;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markUsersDirty">;
}

export interface RegisterPurveyorContactUseCaseDeps {
  auditLogWriter: Pick<AuditLogWriterPort, "recordAuditLog">;
  config: {
    nodeEnv: string;
  };
  mobileService: RegisterPurveyorMobilePort;
  uow: UnitOfWorkPort<RegisterPurveyorContactTransactionPorts>;
}
