import type { OrganizationRouteHandler } from "./organization.type";
import * as organizationService from "@/services/organization/organization.service";
import * as resp from "@/utils/http/response";

export const organizationsSearch: OrganizationRouteHandler<"organizationsSearch"> = async (c) => {
  const organizationQueryDto = c.req.valid("json");
  const data = await organizationService.searchOrganizations(organizationQueryDto);
  return c.json(resp.ok(data));
};

export const organizationsSet: OrganizationRouteHandler<"organizationsSet"> = async (c) => {
  const {parentCode,...organizationCreateDto} = c.req.valid("json");
  const data = await organizationService.setOrganization(organizationCreateDto,parentCode);
  return c.json(resp.ok(data));
};
