import type { InternalRouteHandler } from './internal.type';
import { employmentService } from '@services/employment.common.service';
import { organizationService } from '@services/organization.service';
import { userService } from '@services/user.common.service';
import { success } from '@utils/response.utils';

export const userInfo: InternalRouteHandler<'userInfo'> = async (c) => {
  const { username } = c.req.valid('query');
  const data = await userService.getUserDetailByUsername(username);
  return c.json(success(data));
};

export const usersQueryByOrgPosition: InternalRouteHandler<'usersQueryByOrgPosition'> = async (c) => {
  const { posCode, orgCode, orgScope } = c.req.valid('query');
  const data = await userService.getUsersByOrgPos(orgCode, posCode, orgScope);
  return c.json(success(data));
};

export const usersSearch: InternalRouteHandler<'usersSearch'> = async (c) => {
  const userQueryDto = c.req.valid('json');
  const data = await userService.searchUsers(userQueryDto);
  return c.json(success(data));
};

export const usersSearchWithPrivilegeDelegation: InternalRouteHandler<'usersSearchWithPrivilegeDelegation'> = async (c) => {
  const userQueryDto = c.req.valid('json');
  const data = await userService.searchUsersWithPrivilegeDelegation(userQueryDto);
  return c.json(success(data));
};

export const usersQueryByOrgRole: InternalRouteHandler<'usersQueryByOrgRole'> = async (c) => {
  const { roleCode, orgCode, orgScope } = c.req.valid('query');
  const data = await userService.getUsersByOrgRole(orgCode, roleCode, orgScope);
  return c.json(success(data));
};

export const usersQueryByOrg: InternalRouteHandler<'usersQueryByOrg'> = async (c) => {
  const { orgCode, orgScope } = c.req.valid('query');
  const data = await userService.getUsersByOrg(orgCode, orgScope);
  return c.json(success(data));
};

export const employmentsQueryByUserPriv: InternalRouteHandler<'employmentsQueryByUserPriv'> = async (c) => {
  const { username, privCode } = c.req.valid('query');
  const data = await employmentService.getEmploymentsByUserAndPrivilege(username, privCode, 'full');
  return c.json(success(data));
};

export const purveyorRegister: InternalRouteHandler<'purveyorRegister'> = async (c) => {
  const { orgCode, orgName, parentOrg } = c.req.valid('json');
  const data = await organizationService.purveyorRegister(orgCode, orgName, parentOrg);
  return c.json(success(data));
};

export const contactRegister: InternalRouteHandler<'contactRegister'> = async (c) => {
  const { username, mobile, name, orgCode } = c.req.valid('json');
  const data = await userService.registerPurveyorConcat(username, mobile, name, orgCode);
  return c.json(success(data));
};

export const organizationsSearch: InternalRouteHandler<'organizationsSearch'> = async (c) => {
  const organizationQueryDto = c.req.valid('json');
  const data = await organizationService.searchOrganizations(organizationQueryDto);
  return c.json(success(data));
};

export const organizationGetByCode: InternalRouteHandler<'organizationGetByCode'> = async (c) => {
  const { orgCode } = c.req.valid('query');
  const data = await organizationService.getOrganizationByCode(orgCode);
  return c.json(success(data));
};
