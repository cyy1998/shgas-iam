// 后端 API 前缀。开发环境同样使用此前缀，由 .umirc.ts 中的 proxy 处理跨域。
export const API_PREFIX = process.env.UMI_APP_API_PREFIX || '';

// 当前应用注册到 SSO 的 client code
export const SSO_CLIENT_CODE = process.env.UMI_APP_SSO_CLIENT_CODE || 'iam';

// SSO well-known authentication-configuration 端点
export const WELL_KNOWN_URL =
  process.env.UMI_APP_WELL_KNOWN_URL ||
  '/sso/.well-known/authentication-configuration';

export const CAP_SITE_KEY = process.env.UMI_APP_CAP_SITE_KEY || 'iam-sso';

function withTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

export const CAP_API_ENDPOINT = withTrailingSlash(
  process.env.UMI_APP_CAP_ENDPOINT ||
    `${API_PREFIX}/open/cap/${CAP_SITE_KEY}/`,
);

export const CAP_WASM_URL =
  process.env.UMI_APP_CAP_WASM_URL || '/portal/cap/cap_wasm_bg.wasm';

export const CAP_PAKO_URL =
  process.env.UMI_APP_CAP_PAKO_URL || '/portal/cap/pako_inflate.min.js';
