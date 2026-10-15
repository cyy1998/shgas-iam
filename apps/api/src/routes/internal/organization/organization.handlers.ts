import { runWithinInternalHandlerBudget } from "@api/routes/internal/_handler-budget";
import { getInternalAuditActor } from "@api/services/audit/audit.context";
import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import { buildInternalPurveyorRegisterAudit } from "@api/services/audit/events/internal.audit";
import { OrganizationCreateDtoSchema } from "@api/services/organization/organization.schema";
import type { OrganizationService } from "@api/services/organization/organization.service";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { OrganizationType } from "@iam/contracts";
import {
  type OrganizationSearchQueryService,
  OrganizationSearchUnavailableError,
} from "@iam/organization-search-read-model";
import type { OrganizationRouteHandler } from "./organization.type";

export const INTERNAL_ORGANIZATION_HANDLER_TIMEOUT_MS = 5_000;

export interface CreateOrganizationHandlersDeps {
  auditLogWriter: AuditLogWriterPort;
  organizationSearch: Pick<OrganizationSearchQueryService, "search">;
  organizationService: Pick<
    OrganizationService,
    "findOrganizationByCode" | "getOrganizationByCode" | "setOrganization" | "updateOrganization"
  >;
}

export function createOrganizationHandlers(deps: CreateOrganizationHandlersDeps) {
  const organizationsSearchDsl: OrganizationRouteHandler<"organizationsSearchDsl"> = async (c) => {
    const input = c.req.valid("json");
    const data = await runWithinInternalHandlerBudget(
      () => deps.organizationSearch.search(input),
      INTERNAL_ORGANIZATION_HANDLER_TIMEOUT_MS,
      () => new OrganizationSearchUnavailableError(),
    );
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
    organizationsSearchDsl,
    organizationGetByCode,
    organizationUpdate,
    purveyorRegister,
  };
}

export type OrganizationHandlers = ReturnType<typeof createOrganizationHandlers>;
