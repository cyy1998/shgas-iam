import { z } from "@hono/zod-openapi";
import {
  CustomSsoClientMode,
  CustomSsoClientState,
  OidcClientState,
} from "@iam/contracts";
import { selectClientSchema } from "@iam/db/schema";

const DbClientSchema = z.object(selectClientSchema.shape);
const ClientAdminStorageSchema = DbClientSchema.omit({
  extAttributes: true,
});

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
  return GenericClientRuntimeDtoSchema.parse({
    ...GenericClientRecordSchema.parse(input),
    extAttributes: {},
  });
}

export const CustomSsoClientRuntimeDtoSchema = DbClientSchema.pick({
  id: true,
  clientCode: true,
  clientName: true,
  status: true,
  isDelete: true,
  customSsoEnabled: true,
  customSsoConfig: true,
  customSsoConfigVersion: true,
}).openapi("CustomSsoClientRuntimeDto");

export const CustomSsoClientSecretRecordSchema = DbClientSchema.pick({
  id: true,
  clientCode: true,
  status: true,
  isDelete: true,
  customSsoEnabled: true,
  customSsoConfig: true,
  customSsoSecretHash: true,
  customSsoConfigVersion: true,
});

const ClientAdminDtoBaseSchema = DbClientSchema.omit({
  extAttributes: true,
  oidcSecretHash: true,
  customSsoSecretHash: true,
}).extend({
  extAttributes: z.object({}).strict(),
  oidcState: z.enum(OidcClientState),
  hasOidcSecret: z.boolean(),
  customSsoState: z.enum(CustomSsoClientState),
  customSsoMode: z.enum(CustomSsoClientMode).nullable(),
  hasCustomSsoSecret: z.boolean(),
});

export const ClientAdminListDtoSchema = ClientAdminDtoBaseSchema.omit({
  customSsoEnabled: true,
  customSsoConfig: true,
  customSsoConfigVersion: true,
  hasCustomSsoSecret: true,
}).openapi("ClientAdminListDto");
export const ClientAdminDetailDtoSchema = ClientAdminDtoBaseSchema.omit({
  customSsoEnabled: true,
}).openapi("ClientAdminDetailDto");

export const OidcClientRuntimeDtoSchema = DbClientSchema.pick({
  id: true,
  clientCode: true,
  clientName: true,
  status: true,
  isDelete: true,
  oidcEnabled: true,
  oidcConfig: true,
  oidcConfigVersion: true,
}).openapi("OidcClientRuntimeDto");

export const OidcClientSecretRecordSchema = DbClientSchema.pick({
  id: true,
  clientCode: true,
  oidcSecretHash: true,
  oidcConfigVersion: true,
});

export function getOidcClientState(input: Pick<z.infer<typeof DbClientSchema>, "oidcConfig" | "oidcEnabled">) {
  if (input.oidcConfig === null)
    return OidcClientState.Unconfigured;
  return input.oidcEnabled ? OidcClientState.Enabled : OidcClientState.Disabled;
}

export function getCustomSsoClientState(
  input: Pick<z.infer<typeof DbClientSchema>, "customSsoConfig" | "customSsoEnabled">,
) {
  if (input.customSsoConfig === null)
    return CustomSsoClientState.Unconfigured;
  return input.customSsoEnabled ? CustomSsoClientState.Enabled : CustomSsoClientState.Disabled;
}

function toClientAdminDto(input: unknown) {
  const client = ClientAdminStorageSchema.parse(input);
  return {
    ...client,
    extAttributes: {},
    oidcState: getOidcClientState(client),
    hasOidcSecret: client.oidcSecretHash !== null,
    customSsoState: getCustomSsoClientState(client),
    customSsoMode: client.customSsoConfig?.mode ?? null,
    hasCustomSsoSecret: client.customSsoSecretHash !== null,
  };
}

export function toClientAdminListDto(input: unknown) {
  return ClientAdminListDtoSchema.parse(toClientAdminDto(input));
}

export function toClientAdminDetailDto(input: unknown) {
  return ClientAdminDetailDtoSchema.parse(toClientAdminDto(input));
}
