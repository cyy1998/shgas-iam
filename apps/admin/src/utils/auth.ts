import { SSO_LOGOUT_URL } from '@/constants/config';

// 调用后端 /sso/logout：清 global_session cookie 与 Redis 会话，随后 302 回指定地址。
// 回到 admin 后 getInitialState 会因 401 自动跳转到 SSO 登录页。
export function logout() {
  const redirectUrl = encodeURIComponent(`${window.location.origin}/`);
  const separator = SSO_LOGOUT_URL.includes('?') ? '&' : '?';
  window.location.href = `${SSO_LOGOUT_URL}${separator}redirectUrl=${redirectUrl}`;
}
