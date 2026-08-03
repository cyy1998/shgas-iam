import type { z } from "@hono/zod-openapi";
import type {
  ClientAdminDetailDtoSchema,
  ClientAdminListDtoSchema,
  CustomSsoClientRuntimeDtoSchema,
  CustomSsoClientSecretRecordSchema,
  GenericClientRecordSchema,
  GenericClientRuntimeDtoSchema,
  OidcClientRuntimeDtoSchema,
  OidcClientSecretRecordSchema,
} from "./schema";

export type CustomSsoClientRuntimeDto = z.infer<typeof CustomSsoClientRuntimeDtoSchema>;
export type CustomSsoClientSecretRecord = z.infer<typeof CustomSsoClientSecretRecordSchema>;
export type GenericClientRecord = z.infer<typeof GenericClientRecordSchema>;
export type GenericClientRuntimeDto = z.infer<typeof GenericClientRuntimeDtoSchema>;
export type ClientAdminListDto = z.infer<typeof ClientAdminListDtoSchema>;
export type ClientAdminDetailDto = z.infer<typeof ClientAdminDetailDtoSchema>;
export type OidcClientRuntimeDto = z.infer<typeof OidcClientRuntimeDtoSchema>;
export type OidcClientSecretRecord = z.infer<typeof OidcClientSecretRecordSchema>;
