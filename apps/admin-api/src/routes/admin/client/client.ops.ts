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
  handler: input => clientService.createClient(input),
});

export const updateClientOp = defineMutationOp({
  input: z.object({
    clientCode: z.string(),
    data: ClientUpdateDtoSchema,
  }),
  handler: ({ clientCode, data }) => clientService.updateClient(clientCode, data),
});

export const updateClientByIdOp = defineMutationOp({
  input: ClientInputDtoSchema,
  handler: input => clientService.updateClientById(input),
});

export const updateClientStatusOp = defineMutationOp({
  input: z.object({
    clientCode: z.string(),
    status: ClientStatusUpdateDtoSchema.shape.status,
  }),
  handler: ({ clientCode, status }) => clientService.updateClientStatus(clientCode, status),
});

export const deleteClientOp = defineMutationOp({
  input: z.object({ clientCode: z.string() }),
  handler: ({ clientCode }) => clientService.deleteClient(clientCode),
});
