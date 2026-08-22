import type { z } from "@hono/zod-openapi";
import type { CustomSsoClientConfig } from "@iam/db/schema";
import type {
  AdminClientRecordSchema,
  ClientCreateDtoSchema,
  ClientCustomSsoConfigureDtoSchema,
  ClientInputDtoSchema,
  ClientOidcConfigureDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientUpdateDtoSchema,
} from "./client.schema";

export type { ClientAdminDetailDto, ClientAdminListDto } from "@iam/domain/client";
export type AdminClientRecord = z.infer<typeof AdminClientRecordSchema>;
export interface ClientInputDto extends z.infer<typeof ClientInputDtoSchema> {};
export interface ClientCreateDto extends z.infer<typeof ClientCreateDtoSchema> {};
export interface ClientUpdateDto extends z.infer<typeof ClientUpdateDtoSchema> {};
export interface ClientPaginationQueryDto extends z.infer<typeof ClientPaginationQueryDtoSchema> {};
export type ClientOidcConfigureDto = z.infer<typeof ClientOidcConfigureDtoSchema>;
export type ClientCustomSsoConfigureDto = z.infer<typeof ClientCustomSsoConfigureDtoSchema>;

export interface AdminClientOidcUpdate {
  oidcEnabled?: boolean;
  oidcConfig?: ClientOidcConfigureDto | null;
  oidcSecretHash?: string | null;
}

export interface AdminClientCustomSsoUpdate {
  customSsoEnabled?: boolean;
  customSsoConfig?: CustomSsoClientConfig | null;
  customSsoSecretHash?: string | null;
}
