import type { AuthRouteHandler } from './auth.types';
import { success } from '@utils/response.utils';
import { getCookie, setCookie } from 'hono/cookie';
import { config } from 'src/config';
import * as authService from './auth.service';

export const loginPassword: AuthRouteHandler<'loginPassword'> = async (c) => {
  const { username, password } = c.req.valid('json');
  const data = await authService.loginPassword(username, password);
  setCookie(c, 'global_session', data.token, {
    httpOnly: true,
    sameSite: 'Strict', // 防 CSRF
    maxAge: config.REDIS_EXPIRE_TIME,
    path: '/',
  });
  return c.json(success(data));
};

export const loginMobile: AuthRouteHandler<'loginMobile'> = async (c) => {
  const { code, phoneNumber } = c.req.valid('json');
  const data = await authService.loginMobile(phoneNumber, code);
  setCookie(c, 'global_session', data.token, {
    httpOnly: true,
    sameSite: 'Strict', // 防 CSRF
    maxAge: config.REDIS_EXPIRE_TIME,
    path: '/',
  });
  return c.json(success(data));
};

export const loginWX: AuthRouteHandler<'loginWX'> = async (c) => {
  const { code } = c.req.valid('json');
  const data = await authService.loginWX(code);
  setCookie(c, 'session', data.token, {
    httpOnly: true,
    sameSite: 'Strict', // 防 CSRF
    maxAge: config.REDIS_EXPIRE_TIME,
    path: '/',
  });
  return c.json(success(data));
};

export const authz: AuthRouteHandler<'authz'> = async (c) => {
  const clientCode = c.req.header('Client') ?? null;
  const sessionId = getCookie(c, `local_${clientCode}_session`) ?? null;
  const data = await authService.authz(sessionId, clientCode, c.req.header('X-Forwarded-Uri'));
  c.header('X-User-Info', data);
  return c.json(success(data));
};
