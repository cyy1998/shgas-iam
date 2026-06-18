import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { EmploymentRepository } from "@api/services/employment/employment.repository";
import type { MobileService } from "@api/services/mobile/mobile.service";
import type { OrganizationRepository } from "@api/services/organization/organization.repository";
import type { PositionRepository } from "@api/services/position/position.repository";
import type { UserRepository } from "@api/services/user/user.repository";
import type { UserService } from "@api/services/user/user.service";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { UserRouteHandler } from "./user.type";
import { getInternalAuditActor } from "@api/services/audit/audit.service";
import { buildInternalPurveyorContactRegisterAudit } from "@api/services/audit/events/internal.audit";
import { CustomError } from "@iam/api-core/errors/CustomError";
import * as resp from "@iam/api-core/http";
import { UserType } from "@iam/contracts";

export interface ContactRegistrationTransactionPorts {
  employmentRepository: Pick<EmploymentRepository, "getEmploymentByUserOrgPosId" | "setEmployment">;
  organizationRepository: Pick<OrganizationRepository, "getOrganizationByCode">;
  positionRepository: Pick<PositionRepository, "getPositionByCode">;
  userRepository: Pick<UserRepository, "getUserByMobile" | "setUser">;
}

export type ContactRegistrationUnitOfWorkPort = UnitOfWorkPort<ContactRegistrationTransactionPorts>;

export interface CreateUserHandlersDeps {
  auditLogWriter: AuditLogWriterPort;
  config: {
    nodeEnv: string;
  };
  mobileService: Pick<MobileService, "getPurveyorWelcomeMessage" | "sendMessage">;
  userService: Pick<
    UserService,
    "getUserDetailByUsername" | "searchUsers" | "searchUsersWithPrivilegeDelegation"
  >;
  uow: ContactRegistrationUnitOfWorkPort;
}

export function createUserHandlers(deps: CreateUserHandlersDeps) {
  const userInfo: UserRouteHandler<"userInfo"> = async (c) => {
    const { username } = c.req.valid("param");
    const data = await deps.userService.getUserDetailByUsername(username);
    return c.json(resp.ok(data));
  };

  const usersSearch: UserRouteHandler<"usersSearch"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userService.searchUsers(userQueryDto);
    return c.json(resp.ok(data));
  };

  const usersSearchWithPrivilegeDelegation: UserRouteHandler<"usersSearchWithPrivilegeDelegation"> = async (c) => {
    const userQueryDto = c.req.valid("json");
    const data = await deps.userService.searchUsersWithPrivilegeDelegation(userQueryDto);
    return c.json(resp.ok(data));
  };

  const contactRegister: UserRouteHandler<"contactRegister"> = async (c) => {
    const { username, mobile, name, orgCode } = c.req.valid("json");
    const registration = await deps.uow.transaction(async (tx) => {
      const existingUser = await tx.userRepository.getUserByMobile(mobile);
      const [pos, org] = await Promise.all([
        tx.positionRepository.getPositionByCode("P001"),
        tx.organizationRepository.getOrganizationByCode(orgCode),
      ]);
      if (org === null) {
        throw new CustomError("供应商尚未注册");
      }
      if (pos === null) {
        throw new CustomError("系统基本信息缺失");
      }
      if (existingUser !== null) {
        const existingEmployment = await tx.employmentRepository.getEmploymentByUserOrgPosId(
          existingUser.id,
          org.id,
          pos.id,
        );
        if (existingEmployment === null) {
          await tx.employmentRepository.setEmployment(existingUser.id, pos.id, org.id);
        }
        return { targetUserId: existingUser.id, existingContact: true };
      }

      const user = await tx.userRepository.setUser({
        username,
        name,
        mobile,
        userType: UserType.External,
        password: null,
      });
      await tx.employmentRepository.setEmployment(user.id, pos.id, org.id);
      return { targetUserId: user.id, existingContact: false };
    });
    await deps.auditLogWriter.recordAuditLogFromContext(
      c,
      buildInternalPurveyorContactRegisterAudit(getInternalAuditActor(c), {
        targetUserId: registration.targetUserId,
        username,
        name,
        mobile,
        orgCode,
        existingContact: registration.existingContact,
      }),
    );
    if (deps.config.nodeEnv === "production") {
      await deps.mobileService.sendMessage(mobile, deps.mobileService.getPurveyorWelcomeMessage(name));
    }
    return c.json(resp.ok(true));
  };

  return {
    contactRegister,
    userInfo,
    usersSearch,
    usersSearchWithPrivilegeDelegation,
  };
}

export type UserHandlers = ReturnType<typeof createUserHandlers>;
