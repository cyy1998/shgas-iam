import type { ClientStatus, SmsUsage, UserInfo } from '@sso/types/api';
import { request } from '@sso/utils/request';
import { toQueryString } from '@sso/utils/url';

export function sendMessage(body: {
  phoneNumber?: string;
  username?: string;
  usage: SmsUsage;
  capToken?: string;
}) {
  return request<void>('/open/code/send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function selfMobileSendMsg(body: {
  phoneNumber: string;
  usage: SmsUsage;
  capToken?: string;
}) {
  return request<void>('/open/code/send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function codeVerify(body: {
  phoneNumber?: string;
  username?: string;
  usage: SmsUsage;
  code: string;
}) {
  return request<{ result: boolean }>('/open/code/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function passwordReset(body: {
  username: string;
  phoneNumber?: string;
  code: string;
  newPassword: string;
}) {
  return request<void>('/open/password/reset', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function clientStatus(params: { clientCode: string }) {
  const qs = toQueryString(params);
  return request<ClientStatus>(`/open/client/status?${qs}`, {
    skipAuthRedirect: true,
  });
}

export function usersUserInfo(params: { username: string; capToken?: string }) {
  const qs = toQueryString(params);
  return request<Pick<UserInfo, 'username' | 'name' | 'mobile'>>(
    `/open/users/userInfo?${qs}`,
    { skipAuthRedirect: true },
  );
}
