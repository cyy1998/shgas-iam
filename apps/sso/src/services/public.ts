import type { UserInfo } from '@/types/api';
import { request } from '@/utils/request';

export function getCurrentUserInfo() {
  return request<UserInfo>('/api/iam/public/user-info', {
    skipAuthRedirect: true,
  });
}

export function passwordChange(body: {
  oldPassword: string;
  newPassword: string;
}) {
  return request<void>('/api/iam/public/password/change', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function mobileSet(body: { phoneNumber: string; code: string }) {
  return request<void>('/api/iam/public/mobile/set', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
