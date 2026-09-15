import { z } from "@hono/zod-openapi";
import { selectClientSchema } from "@iam/db/schema";

const dbClient = z.object(selectClientSchema.shape);
export const ClientSsoRuntimeDtoSchema = dbClient.pick({
  id: true,
  clientCode: true,
  clientName: true,
  status: true,
  isDelete: true,
  ssoEnabled: true,
  ssoConfig: true,
});

export function toClientSsoRuntimeDto(input: unknown) {
  return ClientSsoRuntimeDtoSchema.parse(input);
}

export const ClientSsoAdminRecordSchema = ClientSsoRuntimeDtoSchema.extend({
  url: dbClient.shape.url,
  description: dbClient.shape.description,
  ssoSecret: dbClient.shape.ssoSecret,
  ssoCredentialId: dbClient.shape.ssoCredentialId,
  ssoSecretUpdatedAt: dbClient.shape.ssoSecretUpdatedAt,
});

export const ClientSsoAdminDtoSchema = ClientSsoRuntimeDtoSchema.extend({
  url: dbClient.shape.url,
  description: dbClient.shape.description,
  hasSsoSecret: z.boolean(),
});

export function toClientSsoAdminDto(input: unknown) {
  const record = ClientSsoAdminRecordSchema.parse(input);
  return ClientSsoAdminDtoSchema.parse({ ...record, hasSsoSecret: record.ssoSecret !== null });
}
