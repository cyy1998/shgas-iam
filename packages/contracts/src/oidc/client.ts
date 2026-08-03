export enum OidcClientType {
  Public = "public",
  Confidential = "confidential",
}

export enum OidcScope {
  OpenId = "openid",
  Profile = "profile",
  Phone = "phone",
  IamEmployments = "iam:employments",
  IamAuthorization = "iam:authorization",
}

export enum OidcTokenEndpointAuthMethod {
  None = "none",
  ClientSecretBasic = "client_secret_basic",
}

export enum OidcClientState {
  Unconfigured = "unconfigured",
  Disabled = "disabled",
  Enabled = "enabled",
}

export const OIDC_SUPPORTED_SCOPES = [
  OidcScope.OpenId,
  OidcScope.Profile,
  OidcScope.Phone,
  OidcScope.IamEmployments,
  OidcScope.IamAuthorization,
] as const;

export const OIDC_FIXED_PROTOCOL_CAPABILITIES = {
  grantTypes: ["authorization_code"],
  responseTypes: ["code"],
  codeChallengeMethods: ["S256"],
  subjectTypes: ["public"],
  idTokenSigningAlgorithms: ["RS256"],
  accessTokenFormat: "opaque",
} as const;
