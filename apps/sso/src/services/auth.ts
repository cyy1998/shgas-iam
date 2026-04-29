import type { LoginPasswordResult } from '@/types/api';
import { request } from '@/utils/request';

export function login(body: { username: string; password: string }) {
  return request<LoginPasswordResult>('/auth/login/password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function mobileLogin(body: { phoneNumber: string; code: string }) {
  return request<LoginPasswordResult>('/auth/login/mobile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function logout() {
  return request<void>('/auth/logout', { method: 'POST' });
}
