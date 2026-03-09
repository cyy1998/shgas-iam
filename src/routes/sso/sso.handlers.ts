import type { SsoRouteHandler } from './sso.type';
import { ClientManagementLevel } from '@enums/client.managementLevel';
import { authService } from '@services/auth.service';
import { clientService } from '@services/client.service';
import { getProtocolAndHost } from '@utils/common.utils';
import { success } from '@utils/response.utils';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '@/config';

export const endpointsConfiguration: SsoRouteHandler<'endpointsConfiguration'> = async (c) => {
  const origin = (new URL(c.req.url)).origin;
  return c.json(success({
    authorizationEndpoint: `${origin}${config.AUTHORIZATION_ENDPOINT}`,
    logoutEndpoint: `${origin}${config.LOGOUT_ENDPOINT}`,
    thirdPartyOAEndpoint: `${origin}${config.THIRDPARTY_OA_ENDPOINT}`,
  }));
};

export const callback: SsoRouteHandler<'callback'> = async (c) => {
  const { code, client, redirectUrl } = c.req.valid('query');
  const data = await authService.setLocalSession(code, client, redirectUrl);
  setCookie(c, `local_${client}_session`, data.token, {
    httpOnly: true,
    sameSite: 'Strict', // 防 CSRF
    maxAge: config.REDIS_EXPIRE_TIME,
    path: '/',
  });
  if (data.orcasSessionId != null) {
    setCookie(c, `orcas_sso_sessionid`, data.orcasSessionId, {
      httpOnly: true,
      sameSite: 'Strict', // 防 CSRF
      maxAge: config.REDIS_EXPIRE_TIME,
      path: '/',
    });
  }
  return c.redirect(redirectUrl);
};

export const token: SsoRouteHandler<'token'> = async (c) => {
  const { code, client, clientSecret } = c.req.valid('query');
  const data = await authService.setToken(code, client, clientSecret);
  return c.json(success(data));
};

export const authorize: SsoRouteHandler<'authorize'> = async (c) => {
  const { client, redirectUrl } = c.req.valid('query');
  const searchParams = new URLSearchParams(c.req.query());
  const sessionId = getCookie(c, 'global_session');
  const clientInstance = await clientService.getClientByCode(client);
  const data = await authService.authorize(sessionId, client, redirectUrl);
  if (data.isLogin === false) {
    return c.redirect(`${config.LOGIN_ENDPOINT}?${searchParams.toString()}`);
  }
  const callbackPath = clientInstance?.extAttributes.managementLevel === ClientManagementLevel.Gateway
    ? `${getProtocolAndHost(redirectUrl)}/sso/callback`
    : `${clientInstance?.extAttributes.callbackEndpoint}`;
  return c.redirect(`${callbackPath}?code=${data.code}&client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`);
};

export const logout: SsoRouteHandler<'logout'> = async (c) => {
  const { redirectUrl } = c.req.valid('query');
  const token = getCookie(c, 'global_session') ?? null;
  await authService.logout(token);
  deleteCookie(c, 'global_session');
  return c.redirect(redirectUrl ?? config.LOGIN_ENDPOINT);
};

export const loginOA: SsoRouteHandler<'loginOA'> = async (c) => {
  const { loginid, ts, token, redirectUrl, client } = c.req.valid('query');
  const sessionId = getCookie(c, 'global_session') ?? null;
  if (sessionId !== null) {
    await authService.logout(sessionId);
  }
  const data = await authService.loginOA(loginid, ts, token);
  setCookie(c, 'global_session', data.token, {
    httpOnly: true,
    sameSite: 'Strict', // 防 CSRF
    maxAge: config.REDIS_EXPIRE_TIME,
    path: '/',
  });
  return c.redirect(`/sso/authorize?client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`);
};

export const loginWX: SsoRouteHandler<'loginWX'> = async (c) => {
  const { code, redirectUrl, client } = c.req.valid('query');
  const data = await authService.loginWX(code);
  setCookie(c, 'global_session', data.token, {
    httpOnly: true,
    sameSite: 'Strict', // 防 CSRF
    maxAge: config.REDIS_EXPIRE_TIME,
    path: '/',
  });
  return c.redirect(`/sso/authorize?client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`);
};
