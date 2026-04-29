// 生产环境后端 API 默认走 /api/iam，开发走 proxy 同域
export const API_BASE =
  process.env.NODE_ENV === 'production' ? '/api/iam' : '';

// 当前应用注册到 SSO 的 client code
export const SSO_CLIENT_CODE = process.env.UMI_APP_SSO_CLIENT_CODE || 'iam';

// SSO well-known authentication-configuration 端点
export const WELL_KNOWN_URL =
  process.env.UMI_APP_WELL_KNOWN_URL ||
  '/sso/.well-known/authentication-configuration';
