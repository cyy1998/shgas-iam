interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly IAM_SSO_WEB_API_PREFIX?: string;
  readonly IAM_SSO_WEB_CAP_ENDPOINT?: string;
  readonly IAM_SSO_WEB_CAP_PAKO_URL?: string;
  readonly IAM_SSO_WEB_CAP_SITE_KEY?: string;
  readonly IAM_SSO_WEB_CAP_WASM_URL?: string;
  readonly IAM_SSO_WEB_CLIENT_CODE?: string;
  readonly IAM_SSO_WEB_LOGIN_CREDENTIAL_KID?: string;
  readonly IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY?: string;
  readonly IAM_SSO_WEB_WELL_KNOWN_URL?: string;
}

interface Window {
  CAP_PAKO_URL?: string;
}
