// 后端 API 前缀。开发环境同样使用此前缀，由 .umirc.ts 中的 proxy 处理跨域。
export const API_PREFIX = process.env.UMI_APP_API_PREFIX || '';

// 当前应用注册到 SSO 的 client code
export const SSO_CLIENT_CODE = process.env.UMI_APP_SSO_CLIENT_CODE || 'iam';

// SSO well-known authentication-configuration 端点
export const WELL_KNOWN_URL =
  process.env.UMI_APP_WELL_KNOWN_URL ||
  '/sso/.well-known/authentication-configuration';
