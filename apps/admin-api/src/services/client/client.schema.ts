import { z } from "@hono/zod-openapi";
import { insertClientSchema, updateClientSchema } from "@iam/db/schema";
import { ClientDtoSchema } from "@iam/domain/client";

export { ClientDtoSchema };

export const ClientInputDtoSchema = z.object(updateClientSchema.shape).extend({
  id: ClientDtoSchema.shape.id,
}).openapi("ClientInputDto");

export const ClientCreateDtoSchema = z.object(insertClientSchema.shape).openapi("ClientCreateDto");
