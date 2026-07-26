import type { OrganizationService } from "@admin-api/services/organization/organization.service";
import type { OrganizationRouteHandler } from "./organization.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { resolveAdminAuditContext } from "@admin-api/services/audit/audit.context";
import {
  OrganizationChildrenQueryDtoSchema,
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationSelectorQueryDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@admin-api/services/organization/organization.schema";
import { router } from "@iam/api-core/trpc";
import { OrganizationStatus } from "@iam/contracts";
import { z } from "zod";

export interface CreateOrganizationAdapterDeps {
  organizationService: Pick<
    OrganizationService,
    | "deleteOrganization"
    | "getOrganizationChildrenForAdmin"
    | "getOrganizationDetailByCodeForAdmin"
    | "getOrganizationSelectorNodesForAdmin"
    | "searchOrganizationsForAdmin"
    | "setOrganization"
    | "updateOrganization"
    | "updateOrganizationStatus"
  >;
}

export function createOrganizationAdapter(deps: CreateOrganizationAdapterDeps) {
  const searchOrganization = defineAdminApiQueryOperation({
    input: OrganizationPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof OrganizationPaginationQueryDtoSchema>,
    handler: input => deps.organizationService.searchOrganizationsForAdmin(input),
  });

  const getOrganizationChildren = defineAdminApiQueryOperation({
    input: OrganizationChildrenQueryDtoSchema,
    restInput: c => c.req.valid("query") as z.infer<typeof OrganizationChildrenQueryDtoSchema>,
    handler: ({ parentOrgCode, pageNum, pageSize }) =>
      deps.organizationService.getOrganizationChildrenForAdmin(parentOrgCode ?? null, pageNum, pageSize),
  });

  const getOrganizationSelector = defineAdminApiQueryOperation({
    input: OrganizationSelectorQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof OrganizationSelectorQueryDtoSchema>,
    handler: input => deps.organizationService.getOrganizationSelectorNodesForAdmin(input),
  });

  const getOrganization = defineAdminApiQueryOperation({
    input: z.object({ orgCode: z.string() }),
    restInput: c => c.req.valid("param") as { orgCode: string },
    handler: ({ orgCode }) => deps.organizationService.getOrganizationDetailByCodeForAdmin(orgCode),
  });

  const createOrganization = defineAdminApiMutationOperation({
    input: OrganizationCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof OrganizationCreateDtoSchema>,
    handler: (input, context) =>
      deps.organizationService.setOrganization(input, resolveAdminAuditContext(context)),
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
      deps.organizationService.updateOrganization(orgCode, data, resolveAdminAuditContext(context)),
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
      deps.organizationService.updateOrganizationStatus(orgCode, status, resolveAdminAuditContext(context)),
  });

  const deleteOrganization = defineAdminApiMutationOperation({
    input: z.object({ orgCode: z.string() }),
    restInput: c => c.req.valid("param") as { orgCode: string },
    handler: ({ orgCode }, context) =>
      deps.organizationService.deleteOrganization(orgCode, resolveAdminAuditContext(context)),
  });

  const organizationAdminRouter = router({
    search: searchOrganization.toTRPC(),
    children: getOrganizationChildren.toTRPC(),
    selector: getOrganizationSelector.toTRPC(),
    detail: getOrganization.toTRPC(),
    create: createOrganization.toTRPC(),
    update: updateOrganization.toTRPC(),
    updateStatus: updateOrganizationStatus.toTRPC(),
    delete: deleteOrganization.toTRPC(),
  });

  return {
    organizationAdminRouter,
    organizationCreate: createOrganization.toHandler<OrganizationRouteHandler<"organizationCreate">>(),
    organizationDelete: deleteOrganization.toHandler<OrganizationRouteHandler<"organizationDelete">>(),
    organizationDetail: getOrganization.toHandler<OrganizationRouteHandler<"organizationDetail">>(),
    organizationsChildren: getOrganizationChildren.toHandler<OrganizationRouteHandler<"organizationsChildren">>(),
    organizationsSearch: searchOrganization.toHandler<OrganizationRouteHandler<"organizationsSearch">>(),
    organizationsSelector: getOrganizationSelector.toHandler<OrganizationRouteHandler<"organizationsSelector">>(),
    organizationStatusUpdate: updateOrganizationStatus.toHandler<OrganizationRouteHandler<"organizationStatusUpdate">>(),
    organizationUpdate: updateOrganization.toHandler<OrganizationRouteHandler<"organizationUpdate">>(),
  };
}

export type OrganizationAdapter = ReturnType<typeof createOrganizationAdapter>;
