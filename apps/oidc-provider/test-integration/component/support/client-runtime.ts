import type { OidcClientRuntimeMetadata } from "../../../src/provider/client/client-runtime-metadata.ts";

export function clientRuntime(clientCode: string, version = 1): OidcClientRuntimeMetadata {
  return {
    client_id: clientCode,
    client_name: "Operation client",
    iam_client_id: 1,
    oidc_config_version: version,
    allowed_scopes: ["openid"],
    scope: "openid",
    redirect_uris: ["https://client.example/callback"],
    post_logout_redirect_uris: [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    subject_type: "public",
    require_auth_time: true,
    id_token_signed_response_alg: "RS256",
    token_endpoint_auth_method: "none",
  };
}
