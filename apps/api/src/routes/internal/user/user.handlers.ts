import type { UserRouteHandler } from "./user.type";
import { prisma } from "@/db";
import { UserType } from "@/enums/user.type";
import config from "@/env";
import { CustomError } from "@/errors/CustomError";
import * as employmentRepository from "@/services/employment/employment.repository";
import * as mobileService from "@/services/mobile/mobile.service";
import * as organizationRepository from "@/services/organization/organization.repository";
import * as positionRepository from "@/services/position/position.repository";
import * as userRepository from "@/services/user/user.repository";
import * as userService from "@/services/user/user.service";
import * as resp from "@/utils/http/response";

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
  await prisma.$transaction(async (tx) => {
    const existingUser = await userRepository.getUserByMobile(mobile, tx);
    const [pos, comp, org] = await Promise.all([
      positionRepository.getPositionByCode("P001", tx),
      organizationRepository.getOrganizationByCode(config.PURVEYOR_PARENT_ORG, tx),
      organizationRepository.getOrganizationByCode(orgCode, tx),
    ]);
    if (org === null) {
      throw new CustomError("供应商尚未注册");
    }
    if (pos === null || comp === null) {
      throw new CustomError("系统基本信息缺失");
    }
    if (existingUser !== null) {
      const existingEmployment = await employmentRepository.getEmploymentByUserOrgPosId(
        existingUser.id,
        org.id,
        pos.id,
        tx,
      );
      if (existingEmployment === null) {
        await employmentRepository.setEmployment(existingUser.id, pos.id, org.id, comp.id, tx);
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
      await employmentRepository.setEmployment(user.id, pos.id, org.id, comp.id, tx);
    }
  });
  if (config.NODE_ENV === "production") {
    await mobileService.sendMessage(mobile, mobileService.getPurveyorWelcomeMessage(name));
  }
  return c.json(resp.ok(true));
};
