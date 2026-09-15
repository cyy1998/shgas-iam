import { z } from "@hono/zod-openapi";
import { selectClientSchema } from "@iam/db/schema";

const DbClientSchema = z.object(selectClientSchema.shape);
export const GenericClientRecordSchema = DbClientSchema.pick({
  id: true,
  clientCode: true,
  clientName: true,
  clientSecret: true,
  url: true,
  status: true,
  description: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
});
export const GenericClientRuntimeDtoSchema = GenericClientRecordSchema.extend({
  extAttributes: z.object({}).strict(),
}).strict().openapi("ClientRuntime");
export function toGenericClientRuntimeDto(input: unknown) {
  return GenericClientRuntimeDtoSchema.parse({ ...GenericClientRecordSchema.parse(input), extAttributes: {} });
}

/** Ordinary management projection; SSO credentials are never selected into this record. */
export const ClientAdminStorageSchema = GenericClientRecordSchema.extend({
  ssoEnabled: DbClientSchema.shape.ssoEnabled,
  ssoConfig: DbClientSchema.shape.ssoConfig,
  hasSsoSecret: z.boolean(),
});
const ClientAdminDtoSchema = ClientAdminStorageSchema.extend({ extAttributes: z.object({}).strict() });
export const ClientAdminListDtoSchema = ClientAdminDtoSchema.openapi("ClientAdminListDto");
export const ClientAdminDetailDtoSchema = ClientAdminDtoSchema.openapi("ClientAdminDetailDto");
export function toClientAdminListDto(input: unknown) {
  return ClientAdminListDtoSchema.parse({ ...ClientAdminStorageSchema.parse(input), extAttributes: {} });
}
export function toClientAdminDetailDto(input: unknown) {
  return ClientAdminDetailDtoSchema.parse({ ...ClientAdminStorageSchema.parse(input), extAttributes: {} });
}
