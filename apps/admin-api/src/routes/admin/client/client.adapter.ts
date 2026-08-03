import type { ClientService } from "@admin-api/services/client/client.service";
import type { Context } from "hono";
import type { ClientRouteHandler } from "./client.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import {
  getAdminAuditActor,
  getAdminAuditRequestContext,
} from "@admin-api/services/audit/audit.context";
import {
  ClientCreateDtoSchema,
  ClientCustomSsoConfigureDtoSchema,
  ClientInputDtoSchema,
  ClientOidcConfigureDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientStatusUpdateDtoSchema,
  ClientUpdateDtoSchema,
} from "@admin-api/services/client/client.schema";
import { router } from "@iam/api-core/trpc";
import { z } from "zod";

export interface CreateClientAdapterDeps {
  clientService: Pick<
    ClientService,
    | "configureClientCustomSso"
    | "configureClientOidc"
    | "createClient"
    | "deleteClient"
    | "disableClientCustomSso"
    | "disableClientOidc"
    | "enableClientCustomSso"
    | "enableClientOidc"
    | "getClientDetailByCode"
    | "removeClientCustomSso"
    | "removeClientOidc"
    | "rotateClientCustomSsoSecret"
    | "rotateClientOidcSecret"
    | "searchClientsForAdmin"
    | "updateClient"
    | "updateClientById"
    | "updateClientStatus"
  >;
}

function resolveAuditContext(context?: unknown) {
  const hono = (context as { hono?: Context } | undefined)?.hono;
  if (!hono) {
    return undefined;
  }
  return {
    ...getAdminAuditActor(hono),
    ...getAdminAuditRequestContext(hono),
  };
}

export function createClientAdapter(deps: CreateClientAdapterDeps) {
  const searchClient = defineAdminApiQueryOperation({
    input: ClientPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof ClientPaginationQueryDtoSchema>,
    handler: input => deps.clientService.searchClientsForAdmin(input),
  });

  const getClient = defineAdminApiQueryOperation({
    input: z.object({ clientCode: z.string() }),
    restInput: c => c.req.valid("param") as { clientCode: string },
    handler: ({ clientCode }) => deps.clientService.getClientDetailByCode(clientCode),
  });

  const createClient = defineAdminApiMutationOperation({
    input: ClientCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof ClientCreateDtoSchema>,
    handler: (input, context) => deps.clientService.createClient(input, resolveAuditContext(context)),
  });

  const updateClient = defineAdminApiMutationOperation({
    input: z.object({
      clientCode: z.string(),
      data: ClientUpdateDtoSchema,
    }),
    restInput: c => ({
      clientCode: (c.req.valid("param") as { clientCode: string }).clientCode,
      data: c.req.valid("json") as z.infer<typeof ClientUpdateDtoSchema>,
    }),
    handler: ({ clientCode, data }, context) =>
      deps.clientService.updateClient(clientCode, data, resolveAuditContext(context)),
  });

  const updateClientById = defineAdminApiMutationOperation({
    input: ClientInputDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof ClientInputDtoSchema>,
    handler: (input, context) => deps.clientService.updateClientById(input, resolveAuditContext(context)),
  });

  const updateClientStatus = defineAdminApiMutationOperation({
    input: z.object({
      clientCode: z.string(),
      status: ClientStatusUpdateDtoSchema.shape.status,
    }),
    restInput: c => ({
      clientCode: (c.req.valid("param") as { clientCode: string }).clientCode,
      status: (c.req.valid("json") as z.infer<typeof ClientStatusUpdateDtoSchema>).status,
    }),
    handler: ({ clientCode, status }, context) =>
      deps.clientService.updateClientStatus(clientCode, status, resolveAuditContext(context)),
  });

  const deleteClient = defineAdminApiMutationOperation({
    input: z.object({ clientCode: z.string() }),
    restInput: c => c.req.valid("param") as { clientCode: string },
    handler: ({ clientCode }, context) => deps.clientService.deleteClient(clientCode, resolveAuditContext(context)),
  });

  const configureClientOidc = defineAdminApiMutationOperation({
    input: z.object({
      clientCode: z.string(),
      data: ClientOidcConfigureDtoSchema,
    }),
    restInput: c => ({
      clientCode: (c.req.valid("param") as { clientCode: string }).clientCode,
      data: c.req.valid("json") as z.infer<typeof ClientOidcConfigureDtoSchema>,
    }),
    handler: ({ clientCode, data }, context) =>
      deps.clientService.configureClientOidc(clientCode, data, resolveAuditContext(context)),
  });

  const configureClientCustomSso = defineAdminApiMutationOperation({
    input: z.object({
      clientCode: z.string(),
      data: ClientCustomSsoConfigureDtoSchema,
    }),
    restInput: c => ({
      clientCode: (c.req.valid("param") as { clientCode: string }).clientCode,
      data: c.req.valid("json") as z.infer<typeof ClientCustomSsoConfigureDtoSchema>,
    }),
    handler: ({ clientCode, data }, context) =>
      deps.clientService.configureClientCustomSso(clientCode, data, resolveAuditContext(context)),
  });

  function defineClientAction<TResult>(
    handler: (clientCode: string, auditContext: ReturnType<typeof resolveAuditContext>) => Promise<TResult>,
  ) {
    return defineAdminApiMutationOperation({
      input: z.object({ clientCode: z.string() }),
      restInput: c => c.req.valid("param") as { clientCode: string },
      handler: ({ clientCode }, context) => handler(clientCode, resolveAuditContext(context)),
    });
  }

  const enableClientOidc = defineClientAction((clientCode, auditContext) =>
    deps.clientService.enableClientOidc(clientCode, auditContext));
  const disableClientOidc = defineClientAction((clientCode, auditContext) =>
    deps.clientService.disableClientOidc(clientCode, auditContext));
  const removeClientOidc = defineClientAction((clientCode, auditContext) =>
    deps.clientService.removeClientOidc(clientCode, auditContext));
  const rotateClientOidcSecret = defineClientAction((clientCode, auditContext) =>
    deps.clientService.rotateClientOidcSecret(clientCode, auditContext));
  const enableClientCustomSso = defineClientAction((clientCode, auditContext) =>
    deps.clientService.enableClientCustomSso(clientCode, auditContext));
  const disableClientCustomSso = defineClientAction((clientCode, auditContext) =>
    deps.clientService.disableClientCustomSso(clientCode, auditContext));
  const removeClientCustomSso = defineClientAction((clientCode, auditContext) =>
    deps.clientService.removeClientCustomSso(clientCode, auditContext));
  const rotateClientCustomSsoSecret = defineClientAction((clientCode, auditContext) =>
    deps.clientService.rotateClientCustomSsoSecret(clientCode, auditContext));

  const clientAdminRouter = router({
    search: searchClient.toTRPC(),
    detail: getClient.toTRPC(),
    create: createClient.toTRPC(),
    update: updateClient.toTRPC(),
    updateStatus: updateClientStatus.toTRPC(),
    delete: deleteClient.toTRPC(),
    customSsoConfigure: configureClientCustomSso.toTRPC(),
    customSsoEnable: enableClientCustomSso.toTRPC(),
    customSsoDisable: disableClientCustomSso.toTRPC(),
    customSsoRemove: removeClientCustomSso.toTRPC(),
    customSsoRotateSecret: rotateClientCustomSsoSecret.toTRPC(),
    oidcConfigure: configureClientOidc.toTRPC(),
    oidcEnable: enableClientOidc.toTRPC(),
    oidcDisable: disableClientOidc.toTRPC(),
    oidcRemove: removeClientOidc.toTRPC(),
    oidcRotateSecret: rotateClientOidcSecret.toTRPC(),
  });

  return {
    clientAdminRouter,
    clientCreate: createClient.toHandler<ClientRouteHandler<"clientCreate">>(),
    clientCreateLegacy: createClient.toHandler<ClientRouteHandler<"clientCreateLegacy">>(),
    clientDelete: deleteClient.toHandler<ClientRouteHandler<"clientDelete">>(),
    clientDetail: getClient.toHandler<ClientRouteHandler<"clientDetail">>(),
    clientCustomSsoConfigure: configureClientCustomSso.toHandler<ClientRouteHandler<"clientCustomSsoConfigure">>(),
    clientCustomSsoDisable: disableClientCustomSso.toHandler<ClientRouteHandler<"clientCustomSsoDisable">>(),
    clientCustomSsoEnable: enableClientCustomSso.toHandler<ClientRouteHandler<"clientCustomSsoEnable">>(),
    clientCustomSsoRemove: removeClientCustomSso.toHandler<ClientRouteHandler<"clientCustomSsoRemove">>(),
    clientCustomSsoRotateSecret: rotateClientCustomSsoSecret
      .toHandler<ClientRouteHandler<"clientCustomSsoRotateSecret">>(),
    clientOidcConfigure: configureClientOidc.toHandler<ClientRouteHandler<"clientOidcConfigure">>(),
    clientOidcDisable: disableClientOidc.toHandler<ClientRouteHandler<"clientOidcDisable">>(),
    clientOidcEnable: enableClientOidc.toHandler<ClientRouteHandler<"clientOidcEnable">>(),
    clientOidcRemove: removeClientOidc.toHandler<ClientRouteHandler<"clientOidcRemove">>(),
    clientOidcRotateSecret: rotateClientOidcSecret.toHandler<ClientRouteHandler<"clientOidcRotateSecret">>(),
    clientsSearch: searchClient.toHandler<ClientRouteHandler<"clientsSearch">>(),
    clientStatusUpdate: updateClientStatus.toHandler<ClientRouteHandler<"clientStatusUpdate">>(),
    clientUpdate: updateClient.toHandler<ClientRouteHandler<"clientUpdate">>(),
    clientUpdateLegacy: updateClientById.toHandler<ClientRouteHandler<"clientUpdateLegacy">>(),
  };
}

export type ClientAdapter = ReturnType<typeof createClientAdapter>;
