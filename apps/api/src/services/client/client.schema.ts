import { z } from "@hono/zod-openapi";
import { ClientManagementLevel } from "@iam/contracts";
import { selectClientSchema } from "@iam/db/schema";

export const ClientSchema = z.object(selectClientSchema.shape);

export const ClientExtAttributesDtoSchema = z.object({
  userExcluding: z.array(z.string()).default([]),
  requireOrcas: z.boolean().default(false),
  validRedirectUrls: z.array(z.string()).default([]),
  managementLevel: z.enum(ClientManagementLevel).default(ClientManagementLevel.None).openapi({ example: "Independent" }),
  logoutEndpoint: z.url().default("http://localhost:8888"),
  callbackEndpoint: z.url().default("http://localhost:8888"),
}).openapi("ClientExtAttributesDto");

export const ClientDtoSchema = ClientSchema.extend({
  extAttributes: ClientExtAttributesDtoSchema,
});
