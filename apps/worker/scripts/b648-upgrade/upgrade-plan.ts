import type { OfflineClientSsoConfig } from "@iam/contracts/offline-client-sso";
import { ClientCodeSchema, ClientSsoCallbackType, ClientSsoProtocol, ClientStatus, OidcClientType } from "@iam/contracts";
import { z } from "zod";
import { normalizeOfflineClientSsoConfig } from "./offline-configuration";
import {
  CustomSsoClientMode,
  customSsoClientStorageStateSchema,
  oidcClientSecretStateSchema,
} from "./offline-schema";

export const UpgradeSelectionSchema = z
  .object({
    clientCode: ClientCodeSchema,
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    credentialId: z.uuid(),
    protocol: z.enum(ClientSsoProtocol).nullable().optional(),
  })
  .strict();

export const ClientSsoUpgradeManifestSchema = z
  .object({
    version: z.literal(1),
    layout: z.literal("dual-to-single-v1"),
    clients: z
      .array(UpgradeSelectionSchema)
      .max(1000)
      .refine(rows => new Set(rows.map(row => row.clientCode)).size === rows.length),
  })
  .strict();
export type ClientSsoUpgradeManifest = z.infer<typeof ClientSsoUpgradeManifestSchema>;

const SourceSchema = z.object({
  id: z.number().int().positive(),
  client_code: ClientCodeSchema,
  client_name: z.string().min(1).max(128),
  client_secret: z.string().min(1).max(255),
  status: z.enum(ClientStatus),
  is_delete: z.boolean(),
  ext_attributes: z.record(z.string(), z.unknown()),
  oidc_enabled: z.boolean(),
  oidc_config: z.unknown(),
  oidc_secret_hash: z.string().min(1).nullable(),
  oidc_config_version: z.number().int().nonnegative(),
  custom_sso_enabled: z.boolean(),
  custom_sso_config: z.unknown(),
  custom_sso_secret_hash: z.string().min(1).nullable(),
  custom_sso_config_version: z.number().int().nonnegative(),
});

export function readLegacyClient(input: unknown) {
  const row = SourceSchema.parse(input);
  const oidc = oidcClientSecretStateSchema.parse({
    oidcConfig: row.oidc_config,
    oidcSecretHash: row.oidc_secret_hash,
  });
  const custom = customSsoClientStorageStateSchema.parse({
    customSsoEnabled: row.custom_sso_enabled,
    customSsoConfig: row.custom_sso_config,
    customSsoSecretHash: row.custom_sso_secret_hash,
  });
  if (
    (row.oidc_enabled && !oidc.oidcConfig)
    || (custom.customSsoConfig && row.custom_sso_config_version === 0)
  ) {
    throw new Error("Invalid legacy configuration");
  }
  // The old OIDC parser strips unknown keys. Migration must preserve unknown data instead.
  if (
    oidc.oidcConfig
    && JSON.stringify(Object.keys(row.oidc_config as object).sort())
    !== JSON.stringify(Object.keys(oidc.oidcConfig).sort())
  ) {
    throw new Error("Unknown legacy configuration");
  }
  return { row, oidc: oidc.oidcConfig, custom: custom.customSsoConfig };
}

export function planClientSsoUpgrade(
  input: unknown,
  selection: z.infer<typeof UpgradeSelectionSchema>,
) {
  const source = readLegacyClient(input);
  const available = [
    ...(source.oidc ? [ClientSsoProtocol.Oidc] : []),
    ...(source.custom ? [ClientSsoProtocol.CustomSso] : []),
  ];
  const protocol
    = selection.protocol === undefined
      ? available.length === 1
        ? available[0]
        : undefined
      : selection.protocol;
  if (available.length > 0 && (protocol == null || !available.includes(protocol)))
    return { kind: "pending" as const, reason: "protocol-selection-required" };
  if (available.length === 0 && protocol != null)
    return { kind: "pending" as const, reason: "protocol-not-configured" };
  let config: OfflineClientSsoConfig | null = null;
  let enabled = false;
  if (protocol === ClientSsoProtocol.Oidc && source.oidc) {
    const { tokenEndpointAuthMethod: _method, ...fields } = source.oidc;
    config = normalizeOfflineClientSsoConfig({ protocol, ...fields });
    enabled = source.row.oidc_enabled;
  }
  if (protocol === ClientSsoProtocol.CustomSso && source.custom) {
    const custom = source.custom;
    const callbackEndpoint
      = custom.mode === CustomSsoClientMode.Independent ? custom.callbackEndpoint : offlineGatewayCallback(source.row.id);
    config = normalizeOfflineClientSsoConfig({
      protocol,
      callbackEndpoint,
      callbackType: custom.mode === CustomSsoClientMode.Gateway ? ClientSsoCallbackType.Managed : ClientSsoCallbackType.Business,
      validRedirectUrls: custom.validRedirectUrls,
      subjectClaims: custom.subjectClaims,
      ...(custom.mode === CustomSsoClientMode.Gateway ? { orcas: custom.orcas } : {}),
    });
    enabled = source.row.custom_sso_enabled;
  }
  const requiresSecret
    = config !== null
      && (config.protocol === ClientSsoProtocol.Oidc
        ? config.clientType === OidcClientType.Confidential
        : config.callbackType !== ClientSsoCallbackType.Managed);
  return { kind: "ready" as const, config, enabled, requiresSecret };
}

/** Reserved .invalid origin: only an offline CHECK bridge, never a deployed callback. */
export function offlineGatewayCallback(id: number) {
  return `https://iam-offline-upgrade.invalid/client/${id}/sso/callback`;
}
