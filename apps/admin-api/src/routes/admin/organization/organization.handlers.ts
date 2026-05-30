import type { OrganizationRouteHandler } from "./organization.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import * as auditService from "@admin-api/services/audit/audit.service";
import {
  OrganizationChildrenQueryDtoSchema,
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationSelectorQueryDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@admin-api/services/organization/organization.schema";
import * as organizationService from "@admin-api/services/organization/organization.service";
import { router } from "@iam/api-core/trpc";
import { OrganizationStatus } from "@iam/contracts";
import { z } from "zod";

const searchOrganization = defineAdminApiQueryOperation({
  input: OrganizationPaginationQueryDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof OrganizationPaginationQueryDtoSchema>,
  handler: input => organizationService.searchOrganizationsForAdmin(input),
});

const getOrganizationChildren = defineAdminApiQueryOperation({
  input: OrganizationChildrenQueryDtoSchema,
  restInput: c => c.req.valid("query") as z.infer<typeof OrganizationChildrenQueryDtoSchema>,
  handler: ({ parentOrgCode, pageNum, pageSize }) =>
    organizationService.getOrganizationChildrenForAdmin(parentOrgCode ?? null, pageNum, pageSize),
});

const getOrganizationSelector = defineAdminApiQueryOperation({
  input: OrganizationSelectorQueryDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof OrganizationSelectorQueryDtoSchema>,
  handler: input => organizationService.getOrganizationSelectorNodesForAdmin(input),
});

const getOrganization = defineAdminApiQueryOperation({
  input: z.object({ orgCode: z.string() }),
  restInput: c => c.req.valid("param") as { orgCode: string },
  handler: ({ orgCode }) => organizationService.getOrganizationDetailByCodeForAdmin(orgCode),
});

const createOrganization = defineAdminApiMutationOperation({
  input: OrganizationCreateDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof OrganizationCreateDtoSchema>,
  handler: (input, context) =>
    organizationService.setOrganization(input, auditService.resolveAdminAuditContext(context)),
});

const updateOrganization = defineAdminApiMutationOperation({
  input: z.object({
    orgCode: z.string(),
    data: OrganizationUpdateDtoSchema,
  }),
  restInput: c => ({
    orgCode: (c.req.valid("param") as { orgCode: string }).orgCode,
    data: c.req.valid("json") as z.infer<typeof OrganizationUpdateDtoSchema>,
  }),
  handler: ({ orgCode, data }, context) =>
    organizationService.updateOrganization(orgCode, data, auditService.resolveAdminAuditContext(context)),
});

const updateOrganizationStatus = defineAdminApiMutationOperation({
  input: z.object({
    orgCode: z.string(),
    status: z.enum(OrganizationStatus),
  }),
  restInput: c => ({
    orgCode: (c.req.valid("param") as { orgCode: string }).orgCode,
    status: (c.req.valid("json") as { status: OrganizationStatus }).status,
  }),
  handler: ({ orgCode, status }, context) =>
    organizationService.updateOrganizationStatus(orgCode, status, auditService.resolveAdminAuditContext(context)),
});

const deleteOrganization = defineAdminApiMutationOperation({
  input: z.object({ orgCode: z.string() }),
  restInput: c => c.req.valid("param") as { orgCode: string },
  handler: ({ orgCode }, context) =>
    organizationService.deleteOrganization(orgCode, auditService.resolveAdminAuditContext(context)),
});

export const organizationsSearch = searchOrganization.toHandler<OrganizationRouteHandler<"organizationsSearch">>();
export const organizationsChildren
  = getOrganizationChildren.toHandler<OrganizationRouteHandler<"organizationsChildren">>();
export const organizationsSelector
  = getOrganizationSelector.toHandler<OrganizationRouteHandler<"organizationsSelector">>();
export const organizationDetail = getOrganization.toHandler<OrganizationRouteHandler<"organizationDetail">>();
export const organizationCreate = createOrganization.toHandler<OrganizationRouteHandler<"organizationCreate">>();
export const organizationUpdate = updateOrganization.toHandler<OrganizationRouteHandler<"organizationUpdate">>();
export const organizationStatusUpdate
  = updateOrganizationStatus.toHandler<OrganizationRouteHandler<"organizationStatusUpdate">>();
export const organizationDelete = deleteOrganization.toHandler<OrganizationRouteHandler<"organizationDelete">>();

export const organizationAdminRouter = router({
  search: searchOrganization.toTRPC(),
  children: getOrganizationChildren.toTRPC(),
  selector: getOrganizationSelector.toTRPC(),
  detail: getOrganization.toTRPC(),
  create: createOrganization.toTRPC(),
  update: updateOrganization.toTRPC(),
  updateStatus: updateOrganizationStatus.toTRPC(),
  delete: deleteOrganization.toTRPC(),
});
