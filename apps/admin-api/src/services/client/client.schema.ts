import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import {
  ClientSsoProtocol,
  ClientStatus,
} from "@iam/contracts";
import {
  insertClientSchema,
  updateClientSchema,
} from "@iam/db/schema";
import {
  ClientAdminDetailDtoSchema,
  ClientAdminListDtoSchema,
  ClientAdminStorageSchema,
} from "@iam/domain/client";

export { ClientAdminDetailDtoSchema, ClientAdminListDtoSchema };

const genericClientFields = {
  clientCode: true,
  clientName: true,
  clientSecret: true,
  url: true,
  status: true,
  description: true,
  extAttributes: true,
} as const;

const AdminClientStorageWithoutLegacyAttributesSchema
  = ClientAdminStorageSchema;
const genericClientExtAttributesSchema = z.object({}).strict();

export const AdminClientRecordSchema
  = AdminClientStorageWithoutLegacyAttributesSchema.extend({
    extAttributes: genericClientExtAttributesSchema,
  });

export function toAdminClientRecord(input: unknown) {
  return AdminClientRecordSchema.parse({
    ...AdminClientStorageWithoutLegacyAttributesSchema.parse(input),
    extAttributes: {},
  });
}

const genericClientInsertSchema = insertClientSchema
  .pick(genericClientFields)
  .extend({ extAttributes: genericClientExtAttributesSchema.default({}) });
const genericClientUpdateSchema = updateClientSchema
  .pick(genericClientFields)
  .extend({ extAttributes: genericClientExtAttributesSchema.optional() });

export const ClientPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "portal" }),
    }).strict(),
    exactConditions: z.object({
      statuses: z.array(z.enum(ClientStatus)).optional().openapi({
        example: [ClientStatus.Enable, ClientStatus.Maintenance],
      }),
      ssoProtocols: z.array(z.enum(ClientSsoProtocol)).optional(),
      ssoEnabled: z.boolean().optional(),
    }).strict(),
  }).strict(),
).openapi("ClientPaginationQueryDto");

export const ClientInputDtoSchema = z.object(genericClientUpdateSchema.shape).extend({
  id: AdminClientRecordSchema.shape.id,
}).strict().openapi("ClientInputDto");

export const ClientCreateDtoSchema = z.object(genericClientInsertSchema.shape).strict().openapi("ClientCreateDto");

export const ClientUpdateDtoSchema = z.object(genericClientUpdateSchema.omit({ clientCode: true }).shape)
  .strict()
  .openapi("ClientUpdateDto");

export const ClientStatusUpdateDtoSchema = z.object({
  status: z.enum(ClientStatus),
}).openapi("ClientStatusUpdateDto");
