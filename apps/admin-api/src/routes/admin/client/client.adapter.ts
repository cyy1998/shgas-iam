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
  ClientInputDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientStatusUpdateDtoSchema,
  ClientUpdateDtoSchema,
} from "@admin-api/services/client/client.schema";
import { router } from "@iam/api-core/trpc";
import { z } from "zod";

export interface CreateClientAdapterDeps {
  clientService: Pick<
    ClientService,
    | "createClient"
    | "deleteClient"
    | "getClientDetailByCode"
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
    operationId: "admin.client.search",
    input: ClientPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof ClientPaginationQueryDtoSchema>,
    handler: input => deps.clientService.searchClientsForAdmin(input),
  });

  const getClient = defineAdminApiQueryOperation({
    operationId: "admin.client.detail",
    input: z.object({ clientCode: z.string() }),
    restInput: c => c.req.valid("param") as { clientCode: string },
    handler: ({ clientCode }) => deps.clientService.getClientDetailByCode(clientCode),
  });

  const createClient = defineAdminApiMutationOperation({
    operationId: "admin.client.create",
    input: ClientCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof ClientCreateDtoSchema>,
    handler: (input, context) => deps.clientService.createClient(input, resolveAuditContext(context)),
  });

  const updateClient = defineAdminApiMutationOperation({
    operationId: "admin.client.update",
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
    operationId: "admin.client.updateLegacy",
    input: ClientInputDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof ClientInputDtoSchema>,
    handler: (input, context) => deps.clientService.updateClientById(input, resolveAuditContext(context)),
  });

  const updateClientStatus = defineAdminApiMutationOperation({
    operationId: "admin.client.updateStatus",
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
    operationId: "admin.client.delete",
    input: z.object({ clientCode: z.string() }),
    restInput: c => c.req.valid("param") as { clientCode: string },
    handler: ({ clientCode }, context) => deps.clientService.deleteClient(clientCode, resolveAuditContext(context)),
  });

  const clientAdminRouter = router({
    search: searchClient.toTRPC(),
    detail: getClient.toTRPC(),
    create: createClient.toTRPC(),
    update: updateClient.toTRPC(),
    updateStatus: updateClientStatus.toTRPC(),
    delete: deleteClient.toTRPC(),
  });

  return {
    clientAdminRouter,
    clientCreate: createClient.toHandler<ClientRouteHandler<"clientCreate">>(),
    clientCreateLegacy: createClient.toHandler<ClientRouteHandler<"clientCreateLegacy">>(),
    clientDelete: deleteClient.toHandler<ClientRouteHandler<"clientDelete">>(),
    clientDetail: getClient.toHandler<ClientRouteHandler<"clientDetail">>(),
    clientsSearch: searchClient.toHandler<ClientRouteHandler<"clientsSearch">>(),
    clientStatusUpdate: updateClientStatus.toHandler<ClientRouteHandler<"clientStatusUpdate">>(),
    clientUpdate: updateClient.toHandler<ClientRouteHandler<"clientUpdate">>(),
    clientUpdateLegacy: updateClientById.toHandler<ClientRouteHandler<"clientUpdateLegacy">>(),
  };
}

export type ClientAdapter = ReturnType<typeof createClientAdapter>;
