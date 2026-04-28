import type { OrganizationRouteHandler } from "./organization.type";
import { OrganizationType } from "@/enums/organization.type";
import * as organizationRepository from "@/services/organization/organization.repository";
import { OrganizationCreateDtoSchema } from "@/services/organization/organization.schema";
import * as organizationService from "@/services/organization/organization.service";
import * as resp from "@/utils/http/response";

export const organizationsSearch: OrganizationRouteHandler<"organizationsSearch"> = async (c) => {
  const organizationQueryDto = c.req.valid("json");
  const data = await organizationService.searchOrganizations(organizationQueryDto);
  return c.json(resp.ok(data));
};

export const organizationGetByCode: OrganizationRouteHandler<"organizationGetByCode"> = async (c) => {
  const { orgCode } = c.req.valid("param");
  const data = await organizationService.getOrganizationByCode(orgCode);
  return c.json(resp.ok(data));
};

export const organizationUpdate: OrganizationRouteHandler<"organizationUpdate"> = async (c) => {
  const { orgCode } = c.req.valid("param");
  const data = c.req.valid("json");
  const result = await organizationService.updateOrganization(orgCode, data);
  return c.json(resp.ok(result));
};

export const purveyorRegister: OrganizationRouteHandler<"purveyorRegister"> = async (c) => {
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
