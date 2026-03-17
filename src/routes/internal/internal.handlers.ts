import type { InternalRouteHandler } from "./internal.type";
import { userService } from "@services/user.common.service";
import { OrganizationType } from "@/enums/organization.type";
import * as employmentService from "@/services/employment/employment.service";
import * as organizationService from "@/services/organization/organization.service";
import * as resp from "@/utils/http/response";

export const userInfo: InternalRouteHandler<"userInfo"> = async (c) => {
  const { username } = c.req.valid("query");
  const data = await userService.getUserDetailByUsername(username);
  return c.json(resp.ok(data));
};

export const usersQueryByOrgPosition: InternalRouteHandler<"usersQueryByOrgPosition"> = async (c) => {
  const { posCode, orgCode, orgScope } = c.req.valid("query");
  const data = await userService.getUsersByOrgPos(orgCode, posCode, orgScope);
  return c.json(resp.ok(data));
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
  const data = await userService.getUsersByOrgRole(orgCode, roleCode, orgScope);
  return c.json(resp.ok(data));
};

export const usersQueryByOrg: InternalRouteHandler<"usersQueryByOrg"> = async (c) => {
  const { orgCode, orgScope } = c.req.valid("query");
  const data = await userService.getUsersByOrg(orgCode, orgScope);
  return c.json(resp.ok(data));
};

export const employmentsQueryByUserPriv: InternalRouteHandler<"employmentsQueryByUserPriv"> = async (c) => {
  const { username, privCode } = c.req.valid("query");
  const data = await employmentService.getEmploymentsByUserAndPrivilege(username, privCode, "full");
  return c.json(resp.ok(data));
};

export const purveyorRegister: InternalRouteHandler<"purveyorRegister"> = async (c) => {
  const { orgCode, orgName, parentOrg } = c.req.valid("json");
  const exisitngOrg = await organizationService.getOrganizationByCode(orgCode);
  if (exisitngOrg !== null) {
    return c.json(resp.ok(true));
  }
  await organizationService.setOrganization({ orgCode, orgName, parentCode: parentOrg, orgType: OrganizationType.External });
  return c.json(resp.ok(true));
};

export const contactRegister: InternalRouteHandler<"contactRegister"> = async (c) => {
  const { username, mobile, name, orgCode } = c.req.valid("json");
  const data = await userService.registerPurveyorConcat(username, mobile, name, orgCode);
  return c.json(resp.ok(data));
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
