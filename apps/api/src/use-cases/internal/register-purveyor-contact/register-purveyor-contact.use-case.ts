import type { RegisterPurveyorContactUseCaseDeps } from "./register-purveyor-contact.port";
import type {
  RegisterPurveyorContactInput,
  RegisterPurveyorContactOptions,
} from "./register-purveyor-contact.type";
import { withApiRequestContext } from "@api/services/audit/audit.context";
import { buildInternalPurveyorContactRegisterAudit } from "@api/services/audit/events/internal.audit";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { UserType } from "@iam/contracts";
import { OrganizationNotFoundError } from "@iam/domain/organization";

class ConcurrentContactAppearedError extends Error {}
class ConcurrentContactDisappearedError extends Error {}

export function createRegisterPurveyorContactUseCase(deps: RegisterPurveyorContactUseCaseDeps) {
  async function execute(
    input: RegisterPurveyorContactInput,
    options: RegisterPurveyorContactOptions,
  ): Promise<boolean> {
    const existingUser = await deps.userReader.getActiveUserByMobile(input.mobile);
    const registerExistingContact = async () => await deps.uow.transaction(async (tx) => {
      await tx.userRepository.lockPurveyorContactMobile(input.mobile);
      const existingUser = await tx.userRepository.getUserByMobile(input.mobile);
      if (existingUser === null)
        throw new ConcurrentContactDisappearedError();

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
      const existingEmployment = await tx.employmentRepository.getEmploymentByUserOrgPosId(
        existingUser.id,
        organization.id,
        position.id,
      );
      if (existingEmployment === null) {
        await tx.employmentRepository.setEmployment(existingUser.id, position.id, organization.id);
        await tx.userProfileInvalidation.recordChanges([
          { kind: "employment", userId: existingUser.id },
        ]);
      }
      return { targetUserId: existingUser.id, existingContact: true };
    }, { observability: options.requestContext });

    const registerNewContact = async () => {
      const subjectIdentifier = deps.random.uuid();
      return await deps.subjectAccessLifecycle.run({
        subjectIdentifier,
        disposition: "awaiting_publication",
        mutate: async receipt => await deps.uow.transaction(async tx =>
          await tx.subjectAccessMutation.runMutation(
            receipt,
            async () => {
              await tx.userRepository.lockPurveyorContactMobile(input.mobile);
              const existingUser = await tx.userRepository.getUserByMobile(input.mobile);
              if (existingUser !== null)
                throw new ConcurrentContactAppearedError();

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

              const user = await tx.userRepository.setUser({
                username: input.username,
                name: input.name,
                mobile: input.mobile,
                userType: UserType.External,
                password: null,
                subjectIdentifier,
              });
              await tx.employmentRepository.setEmployment(user.id, position.id, organization.id);
              await tx.userProfileInvalidation.recordChanges([
                { kind: "user", userId: user.id },
                { kind: "employment", userId: user.id },
              ]);
              return { targetUserId: user.id, existingContact: false };
            },
            () => "enabled",
          ), { observability: options.requestContext }),
        observability: {
          requestId: options.requestContext?.requestId ?? undefined,
          traceId: options.requestContext?.traceId ?? undefined,
        },
      });
    };

    let registration: Awaited<ReturnType<typeof registerExistingContact>>;
    if (existingUser === null) {
      try {
        registration = await registerNewContact();
      }
      catch (error) {
        if (!(error instanceof ConcurrentContactAppearedError))
          throw error;
        registration = await registerExistingContact();
      }
    }
    else {
      try {
        registration = await registerExistingContact();
      }
      catch (error) {
        if (!(error instanceof ConcurrentContactDisappearedError))
          throw error;
        registration = await registerNewContact();
      }
    }

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
