import type { Context } from "hono";
import * as auditService from "@admin-api/services/audit/audit.service";
import {
  ClientCreateDtoSchema,
  ClientInputDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientStatusUpdateDtoSchema,
  ClientUpdateDtoSchema,
} from "@admin-api/services/client/client.schema";
import * as clientService from "@admin-api/services/client/client.service";
import { defineMutationOp, defineQueryOp } from "@iam/api-core/core/business-op";
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

export const searchClientOp = defineQueryOp({
  input: ClientPaginationQueryDtoSchema,
  handler: input => clientService.searchClientsForAdmin(input),
});

export const getClientOp = defineQueryOp({
  input: z.object({ clientCode: z.string() }),
  handler: ({ clientCode }) => clientService.getClientDetailByCode(clientCode),
});

export const createClientOp = defineMutationOp({
  input: ClientCreateDtoSchema,
  handler: (input, context) => clientService.createClient(input, resolveAuditContext(context)),
});

export const updateClientOp = defineMutationOp({
  input: z.object({
    clientCode: z.string(),
    data: ClientUpdateDtoSchema,
  }),
  handler: ({ clientCode, data }, context) =>
    clientService.updateClient(clientCode, data, resolveAuditContext(context)),
});

export const updateClientByIdOp = defineMutationOp({
  input: ClientInputDtoSchema,
  handler: (input, context) => clientService.updateClientById(input, resolveAuditContext(context)),
});

export const updateClientStatusOp = defineMutationOp({
  input: z.object({
    clientCode: z.string(),
    status: ClientStatusUpdateDtoSchema.shape.status,
  }),
  handler: ({ clientCode, status }, context) =>
    clientService.updateClientStatus(clientCode, status, resolveAuditContext(context)),
});

export const deleteClientOp = defineMutationOp({
  input: z.object({ clientCode: z.string() }),
  handler: ({ clientCode }, context) => clientService.deleteClient(clientCode, resolveAuditContext(context)),
});
