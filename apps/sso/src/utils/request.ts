import { API_BASE, SSO_CLIENT_CODE } from '@/constants/config';
import type { ApiEnvelope } from '@/types/api';
import { currentSearchParams } from '@/utils/url';
import { ServiceStatusCode } from '@iam/shared';
import { history } from '@umijs/max';
import { message } from 'antd';

export class ServiceError extends Error {
  public code: number;
  constructor(msg: string, code: number) {
    super(msg);
    this.name = 'ServiceError';
    this.code = code;
  }
}

type RequestInitExt = RequestInit & { skipAuthRedirect?: boolean };

function preserveQuery(): string {
  const usp = currentSearchParams();
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function gotoLogin() {
  history.replace(`/login${preserveQuery()}`);
}

function gotoMaintenance() {
  history.replace(`/system-maintenance${preserveQuery()}`);
}

export async function request<T>(
  path: string,
  init: RequestInitExt = {},
): Promise<T> {
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      Client: SSO_CLIENT_CODE,
      ...(init.headers ?? {}),
    },
  });

  if (
    res.status === 401 &&
    res.headers.get('forbidden-reason') === 'maintenance'
  ) {
    gotoMaintenance();
    return new Promise<T>(() => {});
  }

  if (res.status === 401 && !init.skipAuthRedirect) {
    gotoLogin();
    return new Promise<T>(() => {});
  }

  if (!res.ok) {
    const msg = `网络错误 (${res.status})`;
    message.error(msg);
    throw new ServiceError(msg, res.status);
  }

  const body = (await res.json()) as ApiEnvelope<T>;

  if (
    body.code === ServiceStatusCode.Unauthorized &&
    !init.skipAuthRedirect
  ) {
    gotoLogin();
    return new Promise<T>(() => {});
  }

  if (body.code !== ServiceStatusCode.Success) {
    const msg = body.message || '请求失败';
    message.error(msg);
    throw new ServiceError(msg, body.code);
  }

  return body.data;
}

export function requestRaw(
  path: string,
  init: RequestInitExt = {},
): Promise<Response> {
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      Client: SSO_CLIENT_CODE,
      ...(init.headers ?? {}),
    },
  });
}
