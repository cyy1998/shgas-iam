import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import {
  ClientStatus,
  createAdminMutationResultSchema,
  CustomSsoClientMode,
  CustomSsoClientState,
  OidcClientState,
  OidcClientType,
  OidcScope,
} from "@iam/contracts";
import {
  customSsoClientConfigSchema,
  insertClientSchema,
  oidcClientConfigSchema,
  selectClientSchema,
  updateClientSchema,
} from "@iam/db/schema";
import {
  ClientAdminDetailDtoSchema,
  ClientAdminListDtoSchema,
  validateRedirectUrlPattern,
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

const AdminClientStorageSchema = z.object(selectClientSchema.shape);
const AdminClientStorageWithoutLegacyAttributesSchema
  = AdminClientStorageSchema.omit({
    extAttributes: true,
  });
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
      customSsoStates: z.array(z.enum(CustomSsoClientState)).optional().openapi({
        example: [CustomSsoClientState.Enabled],
      }),
      customSsoModes: z.array(z.enum(CustomSsoClientMode)).optional().openapi({
        example: [CustomSsoClientMode.Gateway],
      }),
      oidcStates: z.array(z.enum(OidcClientState)).optional().openapi({
        example: [OidcClientState.Enabled],
      }),
      oidcClientTypes: z.array(z.enum(OidcClientType)).optional().openapi({
        example: [OidcClientType.Confidential],
      }),
      oidcAllowedScopes: z.array(z.enum(OidcScope)).optional().openapi({
        example: [OidcScope.OpenId, OidcScope.Profile],
      }),
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

export const ClientOidcConfigureDtoSchema = oidcClientConfigSchema;

const [customSsoGatewayConfigSchema, customSsoIndependentConfigSchema]
  = customSsoClientConfigSchema.options;

export const ClientCustomSsoConfigureDtoSchema = z.discriminatedUnion("mode", [
  customSsoGatewayConfigSchema,
  customSsoIndependentConfigSchema,
])
  .superRefine((config, ctx) => {
    addRedirectUrlPatternIssues(config.validRedirectUrls, ctx, ["validRedirectUrls"]);
  })
  .openapi("ClientCustomSsoConfigureDto");

export const ClientOidcMutationResultSchema = createAdminMutationResultSchema(z.object({
  client: ClientAdminDetailDtoSchema,
  clientSecret: z.string().optional().openapi({
    description: "仅在首次生成或轮换时返回一次的 OIDC client secret",
  }),
})).openapi("ClientOidcMutationResult");

export const ClientCustomSsoMutationResultSchema = createAdminMutationResultSchema(z.object({
  client: ClientAdminDetailDtoSchema,
  customSsoSecret: z.string().optional().openapi({
    description: "仅在创建 Independent、切换到 Independent 或轮换时返回一次的 Custom SSO secret",
  }),
})).openapi("ClientCustomSsoMutationResult");

function addRedirectUrlPatternIssues(
  patterns: string[] | undefined,
  ctx: z.RefinementCtx,
  pathPrefix: PropertyKey[] = [],
) {
  patterns?.forEach((pattern, index) => {
    const result = validateRedirectUrlPattern(pattern);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        path: [...pathPrefix, index],
        message: `存在非法 redirect URL pattern: ${pattern}`,
      });
    }
  });
}
