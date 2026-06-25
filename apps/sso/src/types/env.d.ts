// Declare Node.js process global for environment variables
declare const process: {
  env: {
    NODE_ENV?: string;
    UMI_APP_SSO_API_PREFIX?: string;
    UMI_APP_SSO_CAP_ENDPOINT?: string;
    UMI_APP_SSO_CAP_PAKO_URL?: string;
    UMI_APP_SSO_CAP_SITE_KEY?: string;
    UMI_APP_SSO_CAP_WASM_URL?: string;
    UMI_APP_SSO_CLIENT_CODE?: string;
    UMI_APP_SSO_LOGIN_CREDENTIAL_KID?: string;
    UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY?: string;
    UMI_APP_SSO_WELL_KNOWN_URL?: string;
    [key: string]: string | undefined;
  };
};
