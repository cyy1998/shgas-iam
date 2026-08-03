export const CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME
  = "CustomSsoSessionAuthorization";

export const CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION = {
  type: "apiKey",
  in: "header",
  name: "Authorization",
  description:
    "Opaque Principal or Local Session ID selected by the Client header. Send the raw value without a Bearer prefix.",
} as const;
