import type { LoginPasswordResult } from '@/types/api';
import { request } from '@/utils/request';

export function login(body: { username: string; password: string }) {
  return request<LoginPasswordResult>('/api/iam/auth/login/password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function mobileLogin(body: { phoneNumber: string; code: string }) {
  return request<LoginPasswordResult>('/api/iam/auth/login/mobile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function logout() {
  return request<void>('/api/iam/auth/logout', { method: 'POST' });
}
