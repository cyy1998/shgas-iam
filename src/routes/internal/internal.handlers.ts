import type { InternalRouteHandler } from "./internal.type";
import { prisma } from "@/db";
import { OrganizationType } from "@/enums/organization.type";
import { UserType } from "@/enums/user.type";
import config from "@/env";
import { CustomError } from "@/errors/CustomError";
import * as employmentRepository from "@/services/employment/employment.repository";
import * as employmentService from "@/services/employment/employment.service";
import * as mobileService from "@/services/mobile/mobile.service";
import * as organizationRepository from "@/services/organization/organization.repository";
import { OrganizationCreateDtoSchema } from "@/services/organization/organization.schema";
import * as organizationService from "@/services/organization/organization.service";
import * as positionRepository from "@/services/position/position.repository";
import * as privilegeDelegationService from "@/services/privilege/privilegeDelegation.service";
import * as userRepository from "@/services/user/user.repository";
import * as userService from "@/services/user/user.service";
import * as resp from "@/utils/http/response";

export const userInfo: InternalRouteHandler<"userInfo"> = async (c) => {
  const { username } = c.req.valid("query");
  const data = await userService.getUserDetailByUsername(username);
  return c.json(resp.ok(data));
};

export const usersQueryByOrgPosition: InternalRouteHandler<"usersQueryByOrgPosition"> = async (c) => {
  const { posCode, orgCode, orgScope } = c.req.valid("query");
  const userDtos = await userService.searchUsers({
    positionCodes: [posCode],
    ancestorOrgCodes: [orgCode],
    ancestorOrgDepths: orgScope === "direct" ? [0] : undefined,
  });
  return c.json(resp.ok(userDtos));
};

export const usersSearch: InternalRouteHandler<"usersSearch"> = async (c) => {
  const userQueryDto = c.req.valid("json");
  const data = await userService.searchUsers(userQueryDto);
  return c.json(resp.ok(data));
};

export const usersSearchWithPrivilegeDelegation: InternalRouteHandler<"usersSearchWithPrivilegeDelegation"> = async (c) => {
  const userQueryDto = c.req.valid("json");
  const data = await userService.searchUsersWithPrivilegeDelegation(userQueryDto);
  return c.json(resp.ok(data));
};

export const usersQueryByOrgRole: InternalRouteHandler<"usersQueryByOrgRole"> = async (c) => {
  const { roleCode, orgCode, orgScope } = c.req.valid("query");
  const userDtos = await userService.searchUsers({
    roleCodes: [roleCode],
    ancestorOrgCodes: [orgCode],
    ancestorOrgDepths: orgScope === "direct" ? [0] : undefined,
  });
  return c.json(resp.ok(userDtos));
};

export const usersQueryByOrg: InternalRouteHandler<"usersQueryByOrg"> = async (c) => {
  const { orgCode, orgScope } = c.req.valid("query");
  // const data = await userService.getUsersByOrg(orgCode, orgScope);
  const userDtos = await userService.searchUsers({
    ancestorOrgCodes: [orgCode],
    ancestorOrgDepths: orgScope === "direct" ? [0] : undefined,
  });
  return c.json(resp.ok(userDtos));
};

export const employmentsQueryByUserPriv: InternalRouteHandler<"employmentsQueryByUserPriv"> = async (c) => {
  const { username, privCode } = c.req.valid("query");
  const data = await employmentService.getEmploymentsByUserAndPrivilege(username, privCode, "full");
  return c.json(resp.ok(data));
};

export const purveyorRegister: InternalRouteHandler<"purveyorRegister"> = async (c) => {
  const { orgCode, orgName, parentOrg } = c.req.valid("json");
  const exisitngOrg = await organizationRepository.getOrganizationByCode(orgCode);
  if (exisitngOrg !== null) {
    return c.json(resp.ok(true));
  }
  const organizationCreateDto = OrganizationCreateDtoSchema.parse({
    orgCode,
    orgName,
    orgType: OrganizationType.External,
    isVirtual: true,
    parentCode: parentOrg,
  });
  await organizationService.setOrganization(organizationCreateDto);
  return c.json(resp.ok(true));
};

export const contactRegister: InternalRouteHandler<"contactRegister"> = async (c) => {
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
  // const data = await userService.registerPurveyorConcat(username, mobile, name, orgCode);
  return c.json(resp.ok(true));
};

export const organizationsSearch: InternalRouteHandler<"organizationsSearch"> = async (c) => {
  const organizationQueryDto = c.req.valid("json");
  const data = await organizationService.searchOrganizations(organizationQueryDto);
  return c.json(resp.ok(data));
};

export const organizationGetByCode: InternalRouteHandler<"organizationGetByCode"> = async (c) => {
  const { orgCode } = c.req.valid("query");
  const data = await organizationService.getOrganizationByCode(orgCode);
  return c.json(resp.ok(data));
};

export const privilegeDelegationsQuery: InternalRouteHandler<"privilegeDelegationsQuery"> = async (c) => {
  const query = c.req.valid("json");
  const data = await privilegeDelegationService.queryPrivilegeDelegations(query);
  return c.json(resp.ok(data));
};

export const privilegeDelegationUpdateStatus: InternalRouteHandler<"privilegeDelegationUpdateStatus"> = async (c) => {
  const { id, status } = c.req.valid("json");
  const data = await privilegeDelegationService.updateDelegationStatus(id, status);
  return c.json(resp.ok(data));
};

export const privilegeDelegationSet: InternalRouteHandler<"privilegeDelegationSet"> = async (c) => {
  const dto = c.req.valid("json");
  const data = await privilegeDelegationService.createPrivilegeDelegation(dto);
  return c.json(resp.ok(data));
};
