import { ClientManagementLevel } from "@enums/client.managementLevel";
import { z } from "@hono/zod-openapi";
import { ClientSchema as PrismaClientSchema } from "@/db/generated/schemas";

export const ClientSchema = z.object(PrismaClientSchema.shape);

export const ClientExtAttributesDtoSchema = z.object({
  userExcluding: z.array(z.string()).optional(),
  requireOrcas: z.boolean(),
  validRedirectUrls: z.array(z.string()),
  clientSecret: z.string(),
  managementLevel: z.enum(ClientManagementLevel).openapi({ example: "Independent" }),
  logoutEndpoint: z.url(),
  callbackEndpoint: z.url(),
}).openapi("ClientExtAttributesDto");

export const ClientDtoSchema = ClientSchema.extend({
  extAttributes: ClientExtAttributesDtoSchema,
});

export const ClientInputDtoSchema = ClientDtoSchema.partial().required({
  id: true,
});
