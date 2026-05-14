import { z } from "@hono/zod-openapi";
import { insertClientSchema, selectClientSchema, updateClientSchema } from "@iam/db/schema";

export const ClientDtoSchema = z.object(selectClientSchema.shape).openapi("ClientDto");

export const ClientInputDtoSchema = z.object(updateClientSchema.shape).extend({
  id: ClientDtoSchema.shape.id,
}).openapi("ClientInputDto");

export const ClientCreateDtoSchema = z.object(insertClientSchema.shape).openapi("ClientCreateDto");
