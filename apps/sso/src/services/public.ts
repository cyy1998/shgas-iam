import type { UserInfo } from '@sso/types/api';
import { request } from '@sso/utils/request';

export function getCurrentUserInfo() {
  return request<UserInfo>('/public/user-info');
}

export function passwordChange(body: {
  oldPassword: string;
  newPassword: string;
}) {
  return request<void>('/public/password/change', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function mobileSet(body: { phoneNumber: string; code: string }) {
  return request<void>('/public/mobile/set', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
