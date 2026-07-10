import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { EmploymentRepository } from "@api/services/employment/employment.repository";
import type { MobileService } from "@api/services/mobile/mobile.service";
import type { OrganizationRepository } from "@api/services/organization/organization.repository";
import type { PositionRepository } from "@api/services/position/position.repository";
import type { UserRepository } from "@api/services/user/user.repository";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserProfileDirtyMarker } from "@iam/user-profile-read-model/producer";

export interface RegisterPurveyorContactTransactionPorts {
  employmentRepository: Pick<EmploymentRepository, "getEmploymentByUserOrgPosId" | "setEmployment">;
  organizationRepository: Pick<OrganizationRepository, "getOrganizationByCode">;
  positionRepository: Pick<PositionRepository, "getPositionByCode">;
  userRepository: Pick<UserRepository, "getUserByMobile" | "setUser">;
  profileDirtyMarker: Pick<UserProfileDirtyMarker, "markUsersDirty">;
}

export interface RegisterPurveyorContactUseCaseDeps {
  auditLogWriter: Pick<AuditLogWriterPort, "recordAuditLog">;
  config: {
    nodeEnv: string;
  };
  mobileService: Pick<MobileService, "getPurveyorWelcomeMessage" | "sendMessage">;
  uow: UnitOfWorkPort<RegisterPurveyorContactTransactionPorts>;
}
