import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { OrganizationService } from "@api/services/organization/organization.service";
import type { OrganizationRouteHandler } from "./organization.type";
import { getInternalAuditActor } from "@api/services/audit/audit.context";
import { buildInternalPurveyorRegisterAudit } from "@api/services/audit/events/internal.audit";
import { OrganizationCreateDtoSchema } from "@api/services/organization/organization.schema";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { OrganizationType } from "@iam/contracts";

export interface CreateOrganizationHandlersDeps {
  auditLogWriter: AuditLogWriterPort;
  organizationService: Pick<
    OrganizationService,
    | "findOrganizationByCode"
    | "getOrganizationByCode"
    | "searchOrganizations"
    | "setOrganization"
    | "updateOrganization"
  >;
}

export function createOrganizationHandlers(deps: CreateOrganizationHandlersDeps) {
  const organizationsSearch: OrganizationRouteHandler<"organizationsSearch"> = async (c) => {
    const organizationQueryDto = c.req.valid("json");
    const data = await deps.organizationService.searchOrganizations(organizationQueryDto);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const organizationGetByCode: OrganizationRouteHandler<"organizationGetByCode"> = async (c) => {
    const { orgCode } = c.req.valid("param");
    const data = await deps.organizationService.getOrganizationByCode(orgCode);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const organizationUpdate: OrganizationRouteHandler<"organizationUpdate"> = async (c) => {
    const { orgCode } = c.req.valid("param");
    const data = c.req.valid("json");
    const result = await deps.organizationService.updateOrganization(orgCode, data);
    return c.json(resp.ok(result), HttpStatusCodes.OK);
  };

  const purveyorRegister: OrganizationRouteHandler<"purveyorRegister"> = async (c) => {
    const { orgCode, orgName, parentOrg } = c.req.valid("json");
    const existingOrg = await deps.organizationService.findOrganizationByCode(orgCode);
    if (existingOrg !== null) {
      return c.json(resp.ok(true), HttpStatusCodes.OK);
    }
    const organizationCreateDto = OrganizationCreateDtoSchema.parse({
      orgCode,
      orgName,
      orgType: OrganizationType.External,
      isVirtual: true,
      parentCode: parentOrg,
    });
    await deps.organizationService.setOrganization(organizationCreateDto);
    await deps.auditLogWriter.recordAuditLogFromContext(
      c,
      buildInternalPurveyorRegisterAudit(getInternalAuditActor(c), {
        orgCode,
        orgName,
        parentOrg,
        orgType: OrganizationType.External,
      }),
    );
    return c.json(resp.ok(true), HttpStatusCodes.OK);
  };

  return {
    organizationGetByCode,
    organizationsSearch,
    organizationUpdate,
    purveyorRegister,
  };
}

export type OrganizationHandlers = ReturnType<typeof createOrganizationHandlers>;
