import { z } from "@hono/zod-openapi";
import { clientExtAttributesSchema, selectClientSchema } from "@iam/db/schema";

export const ClientSchema = z.object(selectClientSchema.shape);

export const ClientExtAttributesDtoSchema = clientExtAttributesSchema.openapi("ClientExtAttributesDto");

export const ClientDtoSchema = ClientSchema.extend({
  extAttributes: ClientExtAttributesDtoSchema,
});
