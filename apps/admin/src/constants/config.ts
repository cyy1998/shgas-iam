function normalizeApiPrefix(value?: string) {
  const prefix = value?.trim() ?? '';
  if (!prefix || prefix === '/') return '';
  return prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
}

// 后端 API 前缀。开发、生产均通过 UMI_APP_ADMIN_API_PREFIX 注入。
export const API_PREFIX = normalizeApiPrefix(process.env.UMI_APP_ADMIN_API_PREFIX);

// SSO 授权端点。开发环境走 Vite/Umi proxy，生产可配置为完整 URL。
export const SSO_AUTHORIZE_URL =
  process.env.UMI_APP_ADMIN_SSO_AUTHORIZE_URL || '/sso/authorize';

// SSO 登出端点。同 SSO_AUTHORIZE_URL，开发走 proxy、生产可配置为完整 URL。
export const SSO_LOGOUT_URL =
  process.env.UMI_APP_ADMIN_SSO_LOGOUT_URL || '/sso/logout';

// 当前应用在 SSO 系统中注册的 client code。
export const SSO_CLIENT_CODE =
  process.env.UMI_APP_ADMIN_CLIENT_CODE || 'iam-admin';

// 允许访问管理后台的角色码。
export const ADMIN_ROLE_CODE =
  process.env.UMI_APP_ADMIN_ROLE_CODE || 'iam:admin';

function normalizeExternalUrl(value?: string) {
  const url = value?.trim() ?? '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

// Grafana system-log entry. Admin links out to Grafana; it does not embed or proxy Loki.
export const GRAFANA_URL = normalizeExternalUrl(
  process.env.UMI_APP_ADMIN_GRAFANA_URL || 'http://localhost:30030',
);

export const SYSTEM_LOG_ENV = process.env.UMI_APP_ADMIN_SYSTEM_LOG_ENV || 'dev';
