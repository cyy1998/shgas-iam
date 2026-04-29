import type { ClientStatus, SmsUsage, UserInfo } from '@/types/api';
import { request } from '@/utils/request';
import { toQueryString } from '@/utils/url';

export function sendMessage(body: { phoneNumber: string; usage: SmsUsage }) {
  return request<void>('/api/iam/open/code/send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function selfMobileSendMsg(body: {
  phoneNumber: string;
  usage: SmsUsage;
}) {
  return request<void>('/api/iam/open/sendMessage', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function codeVerify(body: {
  phoneNumber: string;
  usage: SmsUsage;
  code: string;
}) {
  return request<void>('/api/iam/open/code/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function passwordReset(body: {
  username: string;
  phoneNumber: string;
  code: string;
  newPassword: string;
}) {
  return request<void>('/api/iam/open/password/reset', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function clientStatus(params: { clientCode: string }) {
  const qs = toQueryString(params);
  return request<ClientStatus>(`/api/iam/open/client/status?${qs}`, {
    skipAuthRedirect: true,
  });
}

export function usersUserInfo(params: { username: string }) {
  const qs = toQueryString(params);
  return request<Pick<UserInfo, 'username' | 'name' | 'mobile'>>(
    `/api/iam/open/users/userInfo?${qs}`,
    { skipAuthRedirect: true },
  );
}
