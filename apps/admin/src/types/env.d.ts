// Declare Node.js process global for environment variables
declare const process: {
  env: {
    NODE_ENV?: string;
    UMI_APP_ADMIN_API_PREFIX?: string;
    UMI_APP_ADMIN_CLIENT_CODE?: string;
    UMI_APP_ADMIN_GRAFANA_URL?: string;
    UMI_APP_ADMIN_SSO_AUTHORIZE_URL?: string;
    UMI_APP_ADMIN_SSO_LOGOUT_URL?: string;
    UMI_APP_ADMIN_SYSTEM_LOG_ENV?: string;
    [key: string]: string | undefined;
  };
};
