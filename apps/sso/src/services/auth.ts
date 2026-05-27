import type { LoginPasswordResult } from '@sso/types/api';
import { createPasswordLoginCredential } from '@sso/lib/login-credential';
import { request } from '@sso/utils/request';

export function login(body: {
  username: string;
  password: string;
  capToken?: string;
}) {
  return request<LoginPasswordResult>('/auth/login/password', {
    method: 'POST',
    body: JSON.stringify({
      credential: createPasswordLoginCredential({
        username: body.username,
        password: body.password,
      }),
      capToken: body.capToken,
    }),
  });
}

export function mobileLogin(body: {
  phoneNumber: string;
  code: string;
  capToken?: string;
}) {
  return request<LoginPasswordResult>('/auth/login/mobile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function logout() {
  return request<void>('/auth/logout', { method: 'POST' });
}
