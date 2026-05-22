function normalizeApiPrefix(value?: string) {
  const prefix = value?.trim() ?? '';
  if (!prefix || prefix === '/') return '';
  return prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
}

// 后端 API 前缀。开发、生产均通过 UMI_APP_API_PREFIX 注入。
export const API_PREFIX = normalizeApiPrefix(process.env.UMI_APP_API_PREFIX);

// SSO 授权端点。开发环境走 Vite/Umi proxy，生产可配置为完整 URL。
export const SSO_AUTHORIZE_URL =
  process.env.UMI_APP_SSO_AUTHORIZE_URL || '/sso/authorize';

// SSO 登出端点。同 SSO_AUTHORIZE_URL，开发走 proxy、生产可配置为完整 URL。
export const SSO_LOGOUT_URL =
  process.env.UMI_APP_SSO_LOGOUT_URL || '/sso/logout';

// 当前应用在 SSO 系统中注册的 client code。
export const SSO_CLIENT_CODE = process.env.UMI_APP_SSO_CLIENT_CODE || 'iam';

// 允许访问管理后台的角色码。
export const ADMIN_ROLE_CODE =
  process.env.UMI_APP_ADMIN_ROLE_CODE || 'iam:admin';
