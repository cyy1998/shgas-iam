import { SSO_AUTHORIZE_URL, SSO_CLIENT_CODE, SSO_LOGOUT_URL } from '@admin/constants/config';

export function redirectToLogin() {
  const redirectUrl = encodeURIComponent(window.location.href);
  window.location.href = `${SSO_AUTHORIZE_URL}?client=${SSO_CLIENT_CODE}&redirectUrl=${redirectUrl}`;
}

// 调用后端 /sso/logout：清 global_session cookie 与 Redis 会话，随后 302 回指定地址。
// 回到 admin 后 getInitialState 会因 401 自动跳转到 SSO 登录页。
export function logout() {
  // 从当前 pathname 的首段动态推断 base（如 /iam-admin），避免硬编码
  const base = window.location.pathname.split('/')[1];
  const appRoot = `${window.location.origin}/${base}`;
  const redirectUrl = encodeURIComponent(appRoot);
  const separator = SSO_LOGOUT_URL.includes('?') ? '&' : '?';
  window.location.href = `${SSO_LOGOUT_URL}${separator}redirectUrl=${redirectUrl}`;
}
