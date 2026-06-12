import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { ClientManagementLevel, ClientStatus } from "@iam/contracts";
import { insertClientSchema, updateClientSchema } from "@iam/db/schema";
import { ClientDtoSchema, validateRedirectUrlPattern } from "@iam/domain/client";

export { ClientDtoSchema };

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
    }),
  }),
).openapi("ClientPaginationQueryDto");

export const ClientInputDtoSchema = z.object(updateClientSchema.shape).extend({
  id: ClientDtoSchema.shape.id,
}).superRefine((dto, ctx) => {
  addRedirectUrlPatternIssues(dto.extAttributes?.validRedirectUrls, ctx);
}).openapi("ClientInputDto");

export const ClientCreateDtoSchema = z.object(insertClientSchema.shape).superRefine((dto, ctx) => {
  addRedirectUrlPatternIssues(dto.extAttributes.validRedirectUrls, ctx);
}).openapi("ClientCreateDto");

export const ClientUpdateDtoSchema = z.object(updateClientSchema.shape).superRefine((dto, ctx) => {
  addRedirectUrlPatternIssues(dto.extAttributes?.validRedirectUrls, ctx);
}).openapi("ClientUpdateDto");

export const ClientStatusUpdateDtoSchema = z.object({
  status: z.enum(ClientStatus),
}).openapi("ClientStatusUpdateDto");

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
