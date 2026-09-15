import type { ClientSsoService } from "@admin-api/services/client-sso/client-sso.service";
import type { AdminBindings, AdminRouteHandler } from "@admin-api/types/lib";
import type { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { getAdminAuthorizationContext } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { getAdminAuditActor, getAdminAuditRequestContext } from "@admin-api/services/audit/audit.context";
import {
  ClientSsoDetailSchema,
  ClientSsoEnabledSchema,
  ClientSsoMutationResultSchema,
  ClientSsoSaveSchema,
  ClientSsoSecretSchema,
  ClientSsoSelectSchema,
  ClientSsoTargetSchema,
} from "@admin-api/services/client-sso/client-sso.schema";
import { createRoute } from "@hono/zod-openapi";
import { createRouter } from "@iam/api-core/core/create-router";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { router } from "@iam/api-core/trpc";
import { createAdminMutationResultSchema } from "@iam/contracts";
import { z as schema } from "zod";

export function createClientSsoAdapter(service: ClientSsoService) {
  const target = ClientSsoTargetSchema;
  const detail = defineAdminApiQueryOperation({
    operationId: "admin.clientSso.detail",
    input: target,
    restInput: c => target.parse(c.req.valid("param")),
    handler: async ({ clientCode }, { hono }) => {
      const { policy, actor } = getAdminAuthorizationContext(hono);
      const [save, selectProtocol, setEnabled, rotateSecret, readSecret] = await Promise.all([
        policy.decideOperation({ actor, operationId: "admin.clientSso.save" }),
        policy.decideOperation({ actor, operationId: "admin.clientSso.selectProtocol" }),
        policy.decideOperation({ actor, operationId: "admin.clientSso.setEnabled" }),
        policy.decideOperation({ actor, operationId: "admin.clientSso.rotateSecret" }),
        policy.decideOperation({ actor, operationId: "admin.clientSso.readSecret" }),
      ]);
      return ClientSsoDetailSchema.parse({
        ...await service.detail(clientCode),
        allowedActions: {
          save: save.allowed,
          selectProtocol: selectProtocol.allowed,
          setEnabled: setEnabled.allowed,
          rotateSecret: rotateSecret.allowed,
          readSecret: readSecret.allowed,
        },
      });
    },
  });
  const auditContext = (hono: Context) => ({ ...getAdminAuditActor(hono), ...getAdminAuditRequestContext(hono) });
  const deleteClient = defineAdminApiMutationOperation({
    operationId: "admin.clientSso.delete",
    input: target,
    restInput: c => target.parse(c.req.valid("param")),
    handler: ({ clientCode }, { hono }) => service.deleteClient(clientCode, auditContext(hono)),
  });
  const deleteRoute = createRoute({
    method: "delete",
    path: "/{clientCode}",
    tags: ["Admin/Client SSO"],
    request: { params: target },
    responses: { ...commonErrorResponses, [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createAdminMutationResultSchema(schema.null())), "Client 删除结果") },
  });
  const save = defineAdminApiMutationOperation({
    operationId: "admin.clientSso.save",
    input: target.extend({ data: ClientSsoSaveSchema }).strict(),
    restInput: c => ({ ...target.parse(c.req.valid("param")), data: ClientSsoSaveSchema.parse(c.req.valid("json")) }),
    handler: ({ clientCode, data }, { hono }) => service.save(clientCode, data, auditContext(hono)),
  });
  const selectProtocol = defineAdminApiMutationOperation({
    operationId: "admin.clientSso.selectProtocol",
    input: target.extend({ data: ClientSsoSelectSchema }).strict(),
    restInput: c => ({ ...target.parse(c.req.valid("param")), data: ClientSsoSelectSchema.parse(c.req.valid("json")) }),
    handler: ({ clientCode, data }, { hono }) => service.selectProtocol(clientCode, data.config, auditContext(hono)),
  });
  const setEnabled = defineAdminApiMutationOperation({
    operationId: "admin.clientSso.setEnabled",
    input: target.extend({ data: ClientSsoEnabledSchema }).strict(),
    restInput: c => ({ ...target.parse(c.req.valid("param")), data: ClientSsoEnabledSchema.parse(c.req.valid("json")) }),
    handler: ({ clientCode, data }, { hono }) => service.setEnabled(clientCode, data.enabled, auditContext(hono)),
  });
  const responses = {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientSsoMutationResultSchema), "Client 操作结果"),
  };
  const rotateSecret = defineAdminApiMutationOperation({
    operationId: "admin.clientSso.rotateSecret",
    input: target,
    restInput: c => target.parse(c.req.valid("param")),
    handler: ({ clientCode }, { hono }) => service.rotateSecret(clientCode, auditContext(hono)),
  });
  const readSecret = defineAdminApiMutationOperation({
    operationId: "admin.clientSso.readSecret",
    input: target,
    restInput: c => target.parse(c.req.valid("param")),
    handler: async ({ clientCode }, { hono }) => {
      hono.header("Cache-Control", "no-store");
      return ClientSsoSecretSchema.parse(await service.readSecret(clientCode, auditContext(hono)));
    },
  });
  const rotateRoute = createRoute({
    method: "post",
    path: "/{clientCode}/secret/rotate",
    tags: ["Admin/Client SSO"],
    request: { params: target },
    responses,
  });
  const readRoute = createRoute({
    method: "post",
    path: "/{clientCode}/secret/read",
    tags: ["Admin/Client SSO"],
    request: { params: target },
    responses: { ...commonErrorResponses, [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientSsoSecretSchema), "审计后的当前 SSO Secret") },
  });
  function mutationRoute<T extends z.ZodType>(path: string, schema: T) {
    return createRoute({
      method: "post",
      path,
      tags: ["Admin/Client SSO"],
      request: { params: target, body: jsonContentRequired(schema, "Client 命令") },
      responses,
    });
  }
  const detailRoute = createRoute({
    method: "get",
    path: "/{clientCode}",
    tags: ["Admin/Client SSO"],
    request: { params: target },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientSsoDetailSchema), "Client SSO 详情"),
    },
  });
  const saveRoute = mutationRoute("/{clientCode}/save", ClientSsoSaveSchema);
  const selectRoute = mutationRoute("/{clientCode}/protocol", ClientSsoSelectSchema);
  const enabledRoute = mutationRoute("/{clientCode}/enabled", ClientSsoEnabledSchema);
  const rest = createRouter<AdminBindings>()
    .basePath("/clients-sso")
    .openapi(deleteRoute, deleteClient.toHandler<AdminRouteHandler<typeof deleteRoute>>())
    .openapi(detailRoute, detail.toHandler<AdminRouteHandler<typeof detailRoute>>())
    .openapi(saveRoute, save.toHandler<AdminRouteHandler<typeof saveRoute>>())
    .openapi(selectRoute, selectProtocol.toHandler<AdminRouteHandler<typeof selectRoute>>())
    .openapi(enabledRoute, setEnabled.toHandler<AdminRouteHandler<typeof enabledRoute>>())
    .openapi(rotateRoute, rotateSecret.toHandler<AdminRouteHandler<typeof rotateRoute>>())
    .openapi(readRoute, readSecret.toHandler<AdminRouteHandler<typeof readRoute>>());
  const trpc = router({
    delete: deleteClient.toTRPC(),
    detail: detail.toTRPC(),
    save: save.toTRPC(),
    selectProtocol: selectProtocol.toTRPC(),
    setEnabled: setEnabled.toTRPC(),
    rotateSecret: rotateSecret.toTRPC(),
    readSecret: readSecret.toTRPC(),
  });
  return { rest, trpc };
}

export type ClientSsoRouter = ReturnType<typeof createClientSsoAdapter>["trpc"];
