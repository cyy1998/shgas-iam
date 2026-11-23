import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { getAdminAuditActor, getAdminAuditRequestContext } from "@admin-api/services/audit/audit.context";
import {
  DefinitionCreateInputSchema,
  DefinitionListInputSchema,
  DefinitionSetEnabledInputSchema,
  DefinitionUpdateInputSchema,
} from "@admin-api/services/custom-attribute/custom-attribute.schema";
import type { CustomAttributeDefinitionService } from "@admin-api/services/custom-attribute/custom-attribute.service";
import type { AdminBindings, AdminRouteHandler } from "@admin-api/types/lib";
import { createRoute, z } from "@hono/zod-openapi";
import { createRouter } from "@iam/api-core/core/create-router";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { router } from "@iam/api-core/trpc";
import { createAdminMutationResultSchema } from "@iam/contracts";
import { CustomAttributeDefinitionSchema } from "@iam/contracts/custom-attributes";
import { HttpStatusCodes } from "@iam/contracts/http";
import type { Context } from "hono";

function auditContext(hono: Context) {
  return { ...getAdminAuditActor(hono), ...getAdminAuditRequestContext(hono) };
}

export function createCustomAttributeAdapter(service: CustomAttributeDefinitionService) {
  const list = defineAdminApiQueryOperation({
    operationId: "admin.customAttribute.list",
    input: DefinitionListInputSchema,
    restInput: (c) => DefinitionListInputSchema.parse(c.req.valid("param")),
    handler: ({ entityType }) => service.list(entityType),
  });
  const create = defineAdminApiMutationOperation({
    operationId: "admin.customAttribute.create",
    input: DefinitionCreateInputSchema,
    restInput: (c) => DefinitionCreateInputSchema.parse(c.req.valid("json")),
    handler: (input, { hono }) => service.create(input, auditContext(hono)),
  });
  const update = defineAdminApiMutationOperation({
    operationId: "admin.customAttribute.update",
    input: DefinitionUpdateInputSchema,
    restInput: (c) => DefinitionUpdateInputSchema.parse(c.req.valid("json")),
    handler: (input, { hono }) => service.update(input, auditContext(hono)),
  });
  const setEnabled = defineAdminApiMutationOperation({
    operationId: "admin.customAttribute.setEnabled",
    input: DefinitionSetEnabledInputSchema,
    restInput: (c) => DefinitionSetEnabledInputSchema.parse(c.req.valid("json")),
    handler: (input, { hono }) => service.setEnabled(input, auditContext(hono)),
  });

  const tags = ["Admin/Custom Attribute"];
  const listRoute = createRoute({
    method: "get",
    path: "/{entityType}",
    tags,
    request: { params: DefinitionListInputSchema },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(
        createSuccessResponseSchema(z.array(CustomAttributeDefinitionSchema)),
        "自定义属性定义",
      ),
    },
  });
  function mutationRoute<T extends z.ZodType, R extends z.ZodType>(path: string, input: T, output: R) {
    return createRoute({
      method: "post",
      path,
      tags,
      request: { body: jsonContentRequired(input, "自定义属性定义写入") },
      responses: {
        ...commonErrorResponses,
        [HttpStatusCodes.OK]: jsonContent(
          createSuccessResponseSchema(createAdminMutationResultSchema(output)),
          "操作结果",
        ),
      },
    });
  }
  const createDefinition = mutationRoute("/", DefinitionCreateInputSchema, CustomAttributeDefinitionSchema);
  const updateDefinition = mutationRoute("/update", DefinitionUpdateInputSchema, z.null());
  const setDefinitionEnabled = mutationRoute("/enabled", DefinitionSetEnabledInputSchema, z.null());

  return {
    rest: createRouter<AdminBindings>()
      .basePath("/custom-attribute-definitions")
      .openapi(listRoute, list.toHandler<AdminRouteHandler<typeof listRoute>>())
      .openapi(createDefinition, create.toHandler<AdminRouteHandler<typeof createDefinition>>())
      .openapi(updateDefinition, update.toHandler<AdminRouteHandler<typeof updateDefinition>>())
      .openapi(setDefinitionEnabled, setEnabled.toHandler<AdminRouteHandler<typeof setDefinitionEnabled>>()),
    trpc: router({
      list: list.toTRPC(),
      create: create.toTRPC(),
      update: update.toTRPC(),
      setEnabled: setEnabled.toTRPC(),
    }),
  };
}

export type CustomAttributeRouter = ReturnType<typeof createCustomAttributeAdapter>["trpc"];
