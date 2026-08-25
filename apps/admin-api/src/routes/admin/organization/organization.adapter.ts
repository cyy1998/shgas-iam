import type { OrganizationService } from "@admin-api/services/organization/organization.service";
import type { OrganizationRouteHandler } from "./organization.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { getAdminAuthorizationContext } from "@admin-api/services/admin-authorization/admin-authorization.context";
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
  async function resolveOrganizationAuthorization(
    hono: Parameters<typeof getAdminAuthorizationContext>[0],
  ) {
    const { actor, policy } = getAdminAuthorizationContext(hono);
    return await policy.getOrganizationAuthorization(actor);
  }

  const searchOrganization = defineAdminApiQueryOperation({
    operationId: "admin.organization.search",
    input: OrganizationPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof OrganizationPaginationQueryDtoSchema>,
    handler: async (input, context) => {
      return await deps.organizationService.searchOrganizationsForAdmin(
        input,
        await resolveOrganizationAuthorization(context.hono),
      );
    },
  });

  const getOrganizationChildren = defineAdminApiQueryOperation({
    operationId: "admin.organization.children",
    input: OrganizationChildrenQueryDtoSchema,
    restInput: c => c.req.valid("query") as z.infer<typeof OrganizationChildrenQueryDtoSchema>,
    handler: async ({ parentOrgCode, pageNum, pageSize }, context) => {
      return await deps.organizationService.getOrganizationChildrenForAdmin(
        parentOrgCode ?? null,
        pageNum,
        pageSize,
        await resolveOrganizationAuthorization(context.hono),
      );
    },
  });

  const getOrganizationSelector = defineAdminApiQueryOperation({
    operationId: "admin.organization.selector",
    input: OrganizationSelectorQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof OrganizationSelectorQueryDtoSchema>,
    handler: async (input, context) => {
      return await deps.organizationService.getOrganizationSelectorNodesForAdmin(
        input,
        await resolveOrganizationAuthorization(context.hono),
      );
    },
  });

  const getOrganization = defineAdminApiQueryOperation({
    operationId: "admin.organization.detail",
    input: z.object({ orgCode: z.string() }),
    restInput: c => c.req.valid("param") as { orgCode: string },
    handler: async ({ orgCode }, context) => {
      const authorization = await resolveOrganizationAuthorization(context.hono);
      const { authorizationFacts, ...detail } = await deps.organizationService
        .getOrganizationDetailByCodeForAdmin(orgCode, authorization);
      return {
        ...detail,
        allowedActions: authorization.getAllowedActions(authorizationFacts),
      };
    },
  });

  const createOrganization = defineAdminApiMutationOperation({
    operationId: "admin.organization.create",
    input: OrganizationCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof OrganizationCreateDtoSchema>,
    handler: async (input, context) => {
      return await deps.organizationService.setOrganization(
        input,
        resolveAdminAuditContext(context),
        await resolveOrganizationAuthorization(context.hono),
      );
    },
  });

  const updateOrganization = defineAdminApiMutationOperation({
    operationId: "admin.organization.update",
    input: z.object({
      orgCode: z.string(),
      data: OrganizationUpdateDtoSchema,
    }),
    restInput: c => ({
      orgCode: (c.req.valid("param") as { orgCode: string }).orgCode,
      data: c.req.valid("json") as z.infer<typeof OrganizationUpdateDtoSchema>,
    }),
    handler: async ({ orgCode, data }, context) => {
      return await deps.organizationService.updateOrganization(
        orgCode,
        data,
        resolveAdminAuditContext(context),
        await resolveOrganizationAuthorization(context.hono),
      );
    },
  });

  const updateOrganizationStatus = defineAdminApiMutationOperation({
    operationId: "admin.organization.updateStatus",
    input: z.object({
      orgCode: z.string(),
      status: z.enum(OrganizationStatus),
    }),
    restInput: c => ({
      orgCode: (c.req.valid("param") as { orgCode: string }).orgCode,
      status: (c.req.valid("json") as { status: OrganizationStatus }).status,
    }),
    handler: async ({ orgCode, status }, context) => {
      return await deps.organizationService.updateOrganizationStatus(
        orgCode,
        status,
        resolveAdminAuditContext(context),
        await resolveOrganizationAuthorization(context.hono),
      );
    },
  });

  const deleteOrganization = defineAdminApiMutationOperation({
    operationId: "admin.organization.delete",
    input: z.object({ orgCode: z.string() }),
    restInput: c => c.req.valid("param") as { orgCode: string },
    handler: async ({ orgCode }, context) => {
      return await deps.organizationService.deleteOrganization(
        orgCode,
        resolveAdminAuditContext(context),
        await resolveOrganizationAuthorization(context.hono),
      );
    },
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
