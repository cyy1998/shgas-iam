import type { UserRouteHandler } from "./user.type";
import config from "@api/env";
import * as auditService from "@api/services/audit/audit.service";
import * as employmentRepository from "@api/services/employment/employment.repository";
import * as mobileService from "@api/services/mobile/mobile.service";
import * as organizationRepository from "@api/services/organization/organization.repository";
import * as positionRepository from "@api/services/position/position.repository";
import * as userRepository from "@api/services/user/user.repository";
import * as userService from "@api/services/user/user.service";
import { CustomError } from "@iam/api-core/errors/CustomError";
import * as resp from "@iam/api-core/http";
import { UserType } from "@iam/contracts";
import db from "@iam/db";

function maskMobileForAudit(phoneNumber: string) {
  return phoneNumber.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

export const userInfo: UserRouteHandler<"userInfo"> = async (c) => {
  const { username } = c.req.valid("param");
  const data = await userService.getUserDetailByUsername(username);
  return c.json(resp.ok(data));
};

export const usersSearch: UserRouteHandler<"usersSearch"> = async (c) => {
  const userQueryDto = c.req.valid("json");
  const data = await userService.searchUsers(userQueryDto);
  return c.json(resp.ok(data));
};

export const usersSearchWithPrivilegeDelegation: UserRouteHandler<"usersSearchWithPrivilegeDelegation"> = async (c) => {
  const userQueryDto = c.req.valid("json");
  const data = await userService.searchUsersWithPrivilegeDelegation(userQueryDto);
  return c.json(resp.ok(data));
};

export const contactRegister: UserRouteHandler<"contactRegister"> = async (c) => {
  const { username, mobile, name, orgCode } = c.req.valid("json");
  let targetUserId: number | null = null;
  let existingContact = false;
  await db.transaction(async (tx) => {
    const existingUser = await userRepository.getUserByMobile(mobile, tx);
    const [pos, org] = await Promise.all([
      positionRepository.getPositionByCode("P001", tx),
      organizationRepository.getOrganizationByCode(orgCode, tx),
    ]);
    if (org === null) {
      throw new CustomError("供应商尚未注册");
    }
    if (pos === null) {
      throw new CustomError("系统基本信息缺失");
    }
    if (existingUser !== null) {
      targetUserId = existingUser.id;
      existingContact = true;
      const existingEmployment = await employmentRepository.getEmploymentByUserOrgPosId(
        existingUser.id,
        org.id,
        pos.id,
        tx,
      );
      if (existingEmployment === null) {
        await employmentRepository.setEmployment(existingUser.id, pos.id, org.id, tx);
      }
    }
    else {
      const user = await userRepository.setUser({
        username,
        name,
        mobile,
        userType: UserType.External,
        password: null,
      }, tx);
      targetUserId = user.id;
      await employmentRepository.setEmployment(user.id, pos.id, org.id, tx);
    }
  });
  await auditService.recordAuditLogFromContext(c, {
    action: "internal.purveyor_contact.register",
    outcome: "success",
    ...auditService.getInternalAuditActor(c),
    targetType: "user",
    targetId: targetUserId,
    targetCode: username,
    details: {
      username,
      name,
      mobile: maskMobileForAudit(mobile),
      orgCode,
      existingContact,
    },
  });
  if (config.NODE_ENV === "production") {
    await mobileService.sendMessage(mobile, mobileService.getPurveyorWelcomeMessage(name));
  }
  return c.json(resp.ok(true));
};
