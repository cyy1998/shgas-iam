// Declare Node.js process global for environment variables
declare const process: {
  env: {
    NODE_ENV?: string;
    UMI_APP_SSO_CLIENT_CODE?: string;
    UMI_APP_WELL_KNOWN_URL?: string;
    [key: string]: string | undefined;
  };
};
