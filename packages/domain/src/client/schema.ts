import { z } from "@hono/zod-openapi";
import { OidcClientState } from "@iam/contracts";
import { selectClientSchema } from "@iam/db/schema";

const DbClientSchema = z.object(selectClientSchema.shape);

export const CustomSsoClientRuntimeDtoSchema = DbClientSchema.omit({
  oidcEnabled: true,
  oidcConfig: true,
  oidcSecretHash: true,
  oidcConfigVersion: true,
}).openapi("CustomSsoClientRuntimeDto");

// Compatibility alias for existing custom SSO consumers.
export const ClientDtoSchema = CustomSsoClientRuntimeDtoSchema.openapi("ClientDto");

const ClientAdminDtoBaseSchema = DbClientSchema.omit({
  oidcSecretHash: true,
}).extend({
  oidcState: z.enum(OidcClientState),
  hasOidcSecret: z.boolean(),
});

export const ClientAdminListDtoSchema = ClientAdminDtoBaseSchema.openapi("ClientAdminListDto");
export const ClientAdminDetailDtoSchema = ClientAdminDtoBaseSchema.openapi("ClientAdminDetailDto");

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

function toClientAdminDto(input: unknown) {
  const client = DbClientSchema.parse(input);
  return {
    ...client,
    oidcState: getOidcClientState(client),
    hasOidcSecret: client.oidcSecretHash !== null,
  };
}

export function toClientAdminListDto(input: unknown) {
  return ClientAdminListDtoSchema.parse(toClientAdminDto(input));
}

export function toClientAdminDetailDto(input: unknown) {
  return ClientAdminDetailDtoSchema.parse(toClientAdminDto(input));
}
