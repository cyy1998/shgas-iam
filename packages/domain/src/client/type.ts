import type { z } from "@hono/zod-openapi";
import type {
  ClientAdminDetailDtoSchema,
  ClientAdminListDtoSchema,
  ClientDtoSchema,
  CustomSsoClientRuntimeDtoSchema,
  OidcClientRuntimeDtoSchema,
  OidcClientSecretRecordSchema,
} from "./schema";

export type ClientDto = z.infer<typeof ClientDtoSchema>;
export type CustomSsoClientRuntimeDto = z.infer<typeof CustomSsoClientRuntimeDtoSchema>;
export type ClientAdminListDto = z.infer<typeof ClientAdminListDtoSchema>;
export type ClientAdminDetailDto = z.infer<typeof ClientAdminDetailDtoSchema>;
export type OidcClientRuntimeDto = z.infer<typeof OidcClientRuntimeDtoSchema>;
export type OidcClientSecretRecord = z.infer<typeof OidcClientSecretRecordSchema>;
