import {
  SSO_AUTHORIZE_URL,
  SSO_CLIENT_CODE,
  SSO_LOGOUT_URL,
} from '@admin/constants/config';

export function buildLoginRedirectUrl(currentUrl = window.location.href) {
  const redirectUrl = encodeURIComponent(currentUrl);
  return `${SSO_AUTHORIZE_URL}?client=${SSO_CLIENT_CODE}&redirectUrl=${redirectUrl}`;
}

export function redirectToLogin() {
  window.location.href = buildLoginRedirectUrl();
}

// 调用后端 /sso/logout：清 global_session cookie 与 Redis 会话，随后 302 回指定地址。
// 回到 admin 后 getInitialState 会因 401 自动跳转到 SSO 登录页。
export function buildLogoutRedirectUrl(
  location: Pick<Location, 'origin' | 'pathname'> = window.location,
  logoutUrl = SSO_LOGOUT_URL,
) {
  // 从当前 pathname 的首段动态推断 base（如 /iam-admin），避免硬编码
  const base = location.pathname.split('/')[1];
  const appRoot = `${location.origin}/${base}`;
  const redirectUrl = encodeURIComponent(appRoot);
  const separator = logoutUrl.includes('?') ? '&' : '?';
  return `${logoutUrl}${separator}redirectUrl=${redirectUrl}`;
}

export function logout() {
  window.location.href = buildLogoutRedirectUrl();
}
