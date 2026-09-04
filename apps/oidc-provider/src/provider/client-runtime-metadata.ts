import type { OidcClientRuntimeDto } from "@iam/domain/client";
import {
  OIDC_FIXED_PROTOCOL_CAPABILITIES,
  OidcClientType,
} from "@iam/contracts";
import { z } from "zod";

const BCRYPT_MANAGED_SECRET_PLACEHOLDER = "__iam_bcrypt_managed__";

export const OidcClientRuntimeMetadataSchema = z.object({
  client_id: z.string().min(1),
  client_name: z.string(),
  redirect_uris: z.array(z.string()),
  post_logout_redirect_uris: z.array(z.string()),
  grant_types: z.array(z.string()),
  response_types: z.array(z.literal("code")),
  subject_type: z.literal("public"),
  id_token_signed_response_alg: z.literal("RS256"),
  require_auth_time: z.literal(true),
  token_endpoint_auth_method: z.enum(["none", "client_secret_basic"]),
  scope: z.string(),
  iam_client_id: z.number().int().positive(),
  oidc_config_version: z.number().int().positive(),
  allowed_scopes: z.array(z.string()),
  client_secret: z.string().optional(),
  client_secret_expires_at: z.number().int().nonnegative().optional(),
}).strict();

export type OidcClientRuntimeMetadata = z.infer<typeof OidcClientRuntimeMetadataSchema>;

export function toOidcClientRuntimeMetadata(client: OidcClientRuntimeDto): OidcClientRuntimeMetadata {
  if (!client.oidcConfig)
    throw new Error("OIDC client configuration is required");
  const metadata: OidcClientRuntimeMetadata = {
    client_id: client.clientCode,
    client_name: client.clientName,
    redirect_uris: client.oidcConfig.redirectUris,
    post_logout_redirect_uris: client.oidcConfig.postLogoutRedirectUris,
    grant_types: [...OIDC_FIXED_PROTOCOL_CAPABILITIES.grantTypes],
    response_types: [...OIDC_FIXED_PROTOCOL_CAPABILITIES.responseTypes],
    subject_type: "public",
    id_token_signed_response_alg: "RS256",
    require_auth_time: true,
    token_endpoint_auth_method: client.oidcConfig.tokenEndpointAuthMethod,
    scope: client.oidcConfig.allowedScopes.join(" "),
    iam_client_id: client.id,
    oidc_config_version: client.oidcConfigVersion,
    allowed_scopes: client.oidcConfig.allowedScopes,
  };
  if (client.oidcConfig.clientType === OidcClientType.Confidential) {
    metadata.client_secret = BCRYPT_MANAGED_SECRET_PLACEHOLDER;
    metadata.client_secret_expires_at = 0;
  }
  return metadata;
}
