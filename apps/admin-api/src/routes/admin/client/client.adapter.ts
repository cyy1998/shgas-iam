import type { Context } from "hono";
import type { ClientRouteHandler } from "./client.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import * as auditService from "@admin-api/services/audit/audit.service";
import {
  ClientCreateDtoSchema,
  ClientInputDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientStatusUpdateDtoSchema,
  ClientUpdateDtoSchema,
} from "@admin-api/services/client/client.schema";
import * as clientService from "@admin-api/services/client/client.service";
import { router } from "@iam/api-core/trpc";
import { z } from "zod";

function resolveAuditContext(context?: unknown) {
  const hono = (context as { hono?: Context } | undefined)?.hono;
  if (!hono) {
    return undefined;
  }
  return {
    ...auditService.getAdminAuditActor(hono),
    ...auditService.getAdminAuditRequestContext(hono),
  };
}

const searchClient = defineAdminApiQueryOperation({
  input: ClientPaginationQueryDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof ClientPaginationQueryDtoSchema>,
  handler: input => clientService.searchClientsForAdmin(input),
});

const getClient = defineAdminApiQueryOperation({
  input: z.object({ clientCode: z.string() }),
  restInput: c => c.req.valid("param") as { clientCode: string },
  handler: ({ clientCode }) => clientService.getClientDetailByCode(clientCode),
});

const createClient = defineAdminApiMutationOperation({
  input: ClientCreateDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof ClientCreateDtoSchema>,
  handler: (input, context) => clientService.createClient(input, resolveAuditContext(context)),
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
    clientService.updateClient(clientCode, data, resolveAuditContext(context)),
});

const updateClientById = defineAdminApiMutationOperation({
  input: ClientInputDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof ClientInputDtoSchema>,
  handler: (input, context) => clientService.updateClientById(input, resolveAuditContext(context)),
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
    clientService.updateClientStatus(clientCode, status, resolveAuditContext(context)),
});

const deleteClient = defineAdminApiMutationOperation({
  input: z.object({ clientCode: z.string() }),
  restInput: c => c.req.valid("param") as { clientCode: string },
  handler: ({ clientCode }, context) => clientService.deleteClient(clientCode, resolveAuditContext(context)),
});

export const clientsSearch = searchClient.toHandler<ClientRouteHandler<"clientsSearch">>();
export const clientDetail = getClient.toHandler<ClientRouteHandler<"clientDetail">>();
export const clientCreate = createClient.toHandler<ClientRouteHandler<"clientCreate">>();
export const clientUpdate = updateClient.toHandler<ClientRouteHandler<"clientUpdate">>();
export const clientStatusUpdate = updateClientStatus.toHandler<ClientRouteHandler<"clientStatusUpdate">>();
export const clientDelete = deleteClient.toHandler<ClientRouteHandler<"clientDelete">>();
export const clientCreateLegacy = createClient.toHandler<ClientRouteHandler<"clientCreateLegacy">>();
export const clientUpdateLegacy = updateClientById.toHandler<ClientRouteHandler<"clientUpdateLegacy">>();

export const clientAdminRouter = router({
  search: searchClient.toTRPC(),
  detail: getClient.toTRPC(),
  create: createClient.toTRPC(),
  update: updateClient.toTRPC(),
  updateStatus: updateClientStatus.toTRPC(),
  delete: deleteClient.toTRPC(),
});
