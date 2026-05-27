import type { UserRouteHandler } from "./user.type";
import config from "@api/env";
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
      await employmentRepository.setEmployment(user.id, pos.id, org.id, tx);
    }
  });
  if (config.NODE_ENV === "production") {
    await mobileService.sendMessage(mobile, mobileService.getPurveyorWelcomeMessage(name));
  }
  return c.json(resp.ok(true));
};
