import { ClientSchema as PrismaClientSchema } from "@api/db/generated/schemas";
import { ClientManagementLevel } from "@api/enums/client.managementLevel";
import { z } from "@hono/zod-openapi";

export const ClientSchema = z.object(PrismaClientSchema.shape);

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

export const ClientInputDtoSchema = ClientDtoSchema.partial().required({
  id: true,
});

export const ClientCreateDtoSchema = ClientDtoSchema.partial().required({
  clientCode: true,
  clientName: true,
  clientSecret: true,
}).omit({
  id: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
}).extend({
  extAttributes: ClientExtAttributesDtoSchema.default({
    userExcluding: [],
    requireOrcas: false,
    validRedirectUrls: [],
    managementLevel: ClientManagementLevel.None,
    logoutEndpoint: "http://localhost:8888",
    callbackEndpoint: "http://localhost:8888",
  }),
}).openapi("ClientCreateDto");
