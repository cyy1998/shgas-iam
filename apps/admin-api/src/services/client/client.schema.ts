import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { ClientManagementLevel, ClientStatus } from "@iam/contracts";
import { insertClientSchema, updateClientSchema } from "@iam/db/schema";
import { ClientDtoSchema } from "@iam/domain/client";

export { ClientDtoSchema };

export const ClientPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "portal" }),
    }),
    exactConditions: z.object({
      statuses: z.array(z.enum(ClientStatus)).optional().openapi({
        example: [ClientStatus.Enable, ClientStatus.Maintance],
      }),
      managementLevels: z.array(z.enum(ClientManagementLevel)).optional().openapi({
        example: [ClientManagementLevel.Gateway],
      }),
    }),
  }),
).openapi("ClientPaginationQueryDto");

export const ClientInputDtoSchema = z.object(updateClientSchema.shape).extend({
  id: ClientDtoSchema.shape.id,
}).openapi("ClientInputDto");

export const ClientCreateDtoSchema = z.object(insertClientSchema.shape).openapi("ClientCreateDto");

export const ClientUpdateDtoSchema = z.object(updateClientSchema.shape).openapi("ClientUpdateDto");

export const ClientStatusUpdateDtoSchema = z.object({
  status: z.enum(ClientStatus),
}).openapi("ClientStatusUpdateDto");
