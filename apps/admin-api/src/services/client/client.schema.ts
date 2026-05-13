import { z } from "@hono/zod-openapi";
import { ClientManagementLevel } from "@iam/contracts";
import { clientExtAttributesSchema, selectClientSchema } from "@iam/db/schema";

export const ClientSchema = z.object(selectClientSchema.shape);

export const ClientExtAttributesDtoSchema = clientExtAttributesSchema.openapi("ClientExtAttributesDto");

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
