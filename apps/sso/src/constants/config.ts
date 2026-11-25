function normalizeApiPrefix(value?: string) {
  const prefix = value?.trim() ?? "";
  if (!prefix || prefix === "/") return "";
  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
}

// 开发代理和生产网关使用同一默认 API 前缀。
export const API_PREFIX = normalizeApiPrefix(import.meta.env.IAM_SSO_WEB_API_PREFIX ?? "/api/iam");

// 当前应用注册到 SSO 的 client code
export const SSO_CLIENT_CODE = import.meta.env.IAM_SSO_WEB_CLIENT_CODE || "iam";

// SSO well-known authentication-configuration 端点
export const WELL_KNOWN_URL =
  import.meta.env.IAM_SSO_WEB_WELL_KNOWN_URL || "/sso/.well-known/authentication-configuration";

export const CAP_SITE_KEY = import.meta.env.IAM_SSO_WEB_CAP_SITE_KEY || "iam-sso";

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

export const CAP_API_ENDPOINT = withTrailingSlash(
  import.meta.env.IAM_SSO_WEB_CAP_ENDPOINT || `${API_PREFIX}/auth/captcha/cap/${CAP_SITE_KEY}/`,
);

export const CAP_WASM_URL = import.meta.env.IAM_SSO_WEB_CAP_WASM_URL || "/portal/cap/cap_wasm_bg.wasm";

export const CAP_PAKO_URL = import.meta.env.IAM_SSO_WEB_CAP_PAKO_URL || "/portal/cap/pako_inflate.min.js";

export const LOGIN_CREDENTIAL_KID = import.meta.env.IAM_SSO_WEB_LOGIN_CREDENTIAL_KID || "";

export const LOGIN_CREDENTIAL_PUBLIC_KEY = import.meta.env.IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY || "";
