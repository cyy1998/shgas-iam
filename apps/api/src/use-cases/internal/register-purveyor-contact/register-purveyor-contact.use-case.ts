import type { RegisterPurveyorContactUseCaseDeps } from "./register-purveyor-contact.port";
import type {
  RegisterPurveyorContactInput,
  RegisterPurveyorContactOptions,
} from "./register-purveyor-contact.type";
import { withApiRequestContext } from "@api/services/audit/audit.service";
import { buildInternalPurveyorContactRegisterAudit } from "@api/services/audit/events/internal.audit";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { UserProfileDirtyReason, UserType } from "@iam/contracts";
import { OrganizationNotFoundError } from "@iam/domain/organization";

export function createRegisterPurveyorContactUseCase(deps: RegisterPurveyorContactUseCaseDeps) {
  async function execute(
    input: RegisterPurveyorContactInput,
    options: RegisterPurveyorContactOptions,
  ): Promise<boolean> {
    const registration = await deps.uow.transaction(async (tx) => {
      const existingUser = await tx.userRepository.getUserByMobile(input.mobile);
      const [position, organization] = await Promise.all([
        tx.positionRepository.getPositionByCode("P001"),
        tx.organizationRepository.getOrganizationByCode(input.orgCode),
      ]);
      if (organization === null) {
        throw new OrganizationNotFoundError("供应商尚未注册");
      }
      if (position === null) {
        throw new CustomError("系统基本信息缺失");
      }
      if (existingUser !== null) {
        const existingEmployment = await tx.employmentRepository.getEmploymentByUserOrgPosId(
          existingUser.id,
          organization.id,
          position.id,
        );
        if (existingEmployment === null) {
          await tx.employmentRepository.setEmployment(existingUser.id, position.id, organization.id);
          await tx.profileDirtyMarker.markUsersDirty({
            userIds: [existingUser.id],
            reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
            afterCommit: tx.afterCommit,
          });
        }
        return { targetUserId: existingUser.id, existingContact: true };
      }

      const user = await tx.userRepository.setUser({
        username: input.username,
        name: input.name,
        mobile: input.mobile,
        userType: UserType.External,
        password: null,
      });
      await tx.employmentRepository.setEmployment(user.id, position.id, organization.id);
      await tx.profileDirtyMarker.markUsersDirty({
        userIds: [user.id],
        reasonCodes: [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
        afterCommit: tx.afterCommit,
      });
      return { targetUserId: user.id, existingContact: false };
    });

    await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
      options.requestContext,
      buildInternalPurveyorContactRegisterAudit(options.actor, {
        targetUserId: registration.targetUserId,
        username: input.username,
        name: input.name,
        mobile: input.mobile,
        orgCode: input.orgCode,
        existingContact: registration.existingContact,
      }),
    ));
    if (deps.config.nodeEnv === "production") {
      await deps.mobileService.sendMessage(
        input.mobile,
        deps.mobileService.getPurveyorWelcomeMessage(input.name),
      );
    }
    return true;
  }

  return { execute };
}

export type RegisterPurveyorContactUseCase = ReturnType<typeof createRegisterPurveyorContactUseCase>;
