import type { OidcClientRuntimeDto } from "@iam/domain/client";
import type { AdapterPayload } from "oidc-provider";
import {
  OIDC_FIXED_PROTOCOL_CAPABILITIES,
  OidcClientType,
} from "@iam/contracts";

const BCRYPT_MANAGED_SECRET_PLACEHOLDER = "__iam_bcrypt_managed__";

export type OidcClientRuntimeMetadata = AdapterPayload & {
  client_id: string;
  iam_client_id: number;
  oidc_config_version: number;
  allowed_scopes: string[];
};

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
