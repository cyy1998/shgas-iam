// Declare Node.js process global for environment variables
declare const process: {
  env: {
    NODE_ENV?: string;
    UMI_APP_ADMIN_ROLE_CODE?: string;
    UMI_APP_API_PREFIX?: string;
    UMI_APP_SSO_AUTHORIZE_URL?: string;
    UMI_APP_SSO_CLIENT_CODE?: string;
    UMI_APP_SSO_LOGOUT_URL?: string;
    [key: string]: string | undefined;
  };
};
