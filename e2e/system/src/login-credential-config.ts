const kid = "2026-05-primary";

export const e2eLoginCredentialEnvironment = {
  IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID: kid,
  IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
    [kid]: "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65",
  }),
};
