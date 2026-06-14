import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import {
  ClientManagementLevel,
  ClientStatus,
  OidcClientState,
  OidcClientType,
  OidcScope,
} from "@iam/contracts";
import { insertClientSchema, oidcClientConfigSchema, updateClientSchema } from "@iam/db/schema";
import {
  ClientAdminDetailDtoSchema,
  ClientAdminListDtoSchema,
  ClientDtoSchema,
  validateRedirectUrlPattern,
} from "@iam/domain/client";

export { ClientAdminDetailDtoSchema, ClientAdminListDtoSchema, ClientDtoSchema };

const oidcManagedFields = {
  oidcEnabled: true,
  oidcConfig: true,
  oidcSecretHash: true,
  oidcConfigVersion: true,
} as const;

const genericClientInsertSchema = insertClientSchema.omit(oidcManagedFields);
const genericClientUpdateSchema = updateClientSchema.omit(oidcManagedFields);

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
      oidcStates: z.array(z.enum(OidcClientState)).optional().openapi({
        example: [OidcClientState.Enabled],
      }),
      oidcClientTypes: z.array(z.enum(OidcClientType)).optional().openapi({
        example: [OidcClientType.Confidential],
      }),
      oidcAllowedScopes: z.array(z.enum(OidcScope)).optional().openapi({
        example: [OidcScope.OpenId, OidcScope.Profile],
      }),
    }),
  }),
).openapi("ClientPaginationQueryDto");

export const ClientInputDtoSchema = z.object(genericClientUpdateSchema.shape).extend({
  id: ClientDtoSchema.shape.id,
}).strict().superRefine((dto, ctx) => {
  addRedirectUrlPatternIssues(dto.extAttributes?.validRedirectUrls, ctx);
}).openapi("ClientInputDto");

export const ClientCreateDtoSchema = z.object(genericClientInsertSchema.shape).strict().superRefine((dto, ctx) => {
  addRedirectUrlPatternIssues(dto.extAttributes.validRedirectUrls, ctx);
}).openapi("ClientCreateDto");

export const ClientUpdateDtoSchema = z.object(genericClientUpdateSchema.omit({ clientCode: true }).shape)
  .strict()
  .superRefine((dto, ctx) => {
    addRedirectUrlPatternIssues(dto.extAttributes?.validRedirectUrls, ctx);
  })
  .openapi("ClientUpdateDto");

export const ClientStatusUpdateDtoSchema = z.object({
  status: z.enum(ClientStatus),
}).openapi("ClientStatusUpdateDto");

export const ClientOidcConfigureDtoSchema = oidcClientConfigSchema;

export const ClientOidcMutationResultSchema = z.object({
  client: ClientAdminDetailDtoSchema,
  clientSecret: z.string().optional().openapi({
    description: "仅在首次生成或轮换时返回一次的 OIDC client secret",
  }),
}).openapi("ClientOidcMutationResult");

function addRedirectUrlPatternIssues(patterns: string[] | undefined, ctx: z.RefinementCtx) {
  patterns?.forEach((pattern, index) => {
    const result = validateRedirectUrlPattern(pattern);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["extAttributes", "validRedirectUrls", index],
        message: `存在非法 redirect URL pattern: ${pattern}`,
      });
    }
  });
}
