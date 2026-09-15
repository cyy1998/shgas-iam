import { z } from "@hono/zod-openapi";
import { ClientCredentialValueSchema } from "@iam/api-core/client-snapshot/credentials";
import { ClientCodeSchema, createAdminMutationResultSchema } from "@iam/contracts";
import {
  ClientSsoAdminDtoSchema,
  ClientSsoAdminRecordSchema,
  ValidatedClientSsoConfigSchema,
} from "@iam/domain/client";

export const ClientSsoTargetSchema = z.object({ clientCode: ClientCodeSchema }).strict();
export const ClientSsoSelectSchema = z.object({ config: ValidatedClientSsoConfigSchema.nullable() }).strict();
export const ClientSsoEnabledSchema = z.object({ enabled: z.boolean() }).strict();
export const ClientSsoSaveSchema = ClientSsoAdminRecordSchema.pick({
  clientName: true,
  url: true,
  description: true,
  status: true,
})
  .extend({ clientName: z.string().trim().min(1).max(128) })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, "至少提交一个字段");

export const ClientSsoDetailSchema = ClientSsoAdminDtoSchema.extend({
  allowedActions: z
    .object({
      save: z.boolean(),
      selectProtocol: z.boolean(),
      setEnabled: z.boolean(),
      rotateSecret: z.boolean(),
      readSecret: z.boolean(),
    })
    .strict(),
});
export const ClientSsoMutationResultSchema = createAdminMutationResultSchema(ClientSsoAdminDtoSchema);
export const ClientSsoSecretSchema = ClientCredentialValueSchema.nullable();
