import { ApiErrorCode, splitFirstPartySsoNavigation } from '@iam/contracts';
import { API_PREFIX, SSO_CLIENT_CODE } from '@sso/constants/config';
import type { ApiEnvelope } from '@sso/types/api';
import { currentSearchParams } from '@sso/utils/url';
import { history } from '@umijs/max';
import { message } from 'antd';

export class ServiceError extends Error {
  public code: ApiErrorCode | number | string;
  constructor(
    msg: string,
    code: ApiErrorCode | number | string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(msg);
    this.name = 'ServiceError';
    this.code = code;
  }
}

type RequestInitExt = RequestInit & {
  skipAuthRedirect?: boolean;
  suppressErrorMessage?: boolean;
};

function preserveQuery(): string {
  const usp = currentSearchParams();
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function loginQuery(): string {
  const usp = currentSearchParams();
  if (usp.get('oidcReturn')) {
    return `?${usp.toString()}`;
  }

  const client = usp.get('client') || SSO_CLIENT_CODE;
  if (usp.get('redirectUrl')) {
    if (!usp.get('client')) usp.set('client', client);
    return `?${usp.toString()}`;
  }

  const navigation = splitFirstPartySsoNavigation(window.location.href);
  const loginParams = new URLSearchParams({
    client,
    redirectUrl: navigation.redirectUrl,
  });
  if (navigation.state !== undefined) {
    loginParams.set('state', navigation.state);
  }
  return `?${loginParams.toString()}`;
}

function gotoLogin() {
  history.replace(`/login${loginQuery()}`);
}

function gotoMaintenance() {
  history.replace(`/systemMaintenance${preserveQuery()}`);
}

function isCode(body: Pick<ApiEnvelope<unknown>, 'code'>, code: ApiErrorCode) {
  return body.code === code;
}

async function readEnvelope<T>(res: Response): Promise<ApiEnvelope<T> | null> {
  return ((await res.clone().json()) as ApiEnvelope<T>) ?? null;
}

function readRetryAfter(res: Response): number | undefined {
  const value = res.headers.get('Retry-After');
  if (!value || !/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

export async function request<T>(
  path: string,
  init: RequestInitExt = {},
): Promise<T> {
  const url = path.startsWith('http')
    ? path
    : `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;

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
    const errorBody = await readEnvelope<T>(res).catch(() => null);
    if (errorBody && isCode(errorBody, ApiErrorCode.Maintenance)) {
      gotoMaintenance();
      return new Promise<T>(() => {});
    }
    const msg = errorBody?.message || `网络错误 (${res.status})`;
    if (
      errorBody &&
      isCode(errorBody, ApiErrorCode.HumanVerificationRequired)
    ) {
      throw new ServiceError(msg, errorBody.code);
    }
    if (!init.suppressErrorMessage) message.error(msg);
    throw new ServiceError(
      msg,
      errorBody?.code ?? res.status,
      readRetryAfter(res),
    );
  }

  const body = (await res.json()) as ApiEnvelope<T>;

  if (isCode(body, ApiErrorCode.Unauthorized) && !init.skipAuthRedirect) {
    gotoLogin();
    return new Promise<T>(() => {});
  }

  if (body.code !== 200) {
    const msg = body.message || '请求失败';
    if (isCode(body, ApiErrorCode.HumanVerificationRequired)) {
      throw new ServiceError(msg, body.code);
    }
    if (!init.suppressErrorMessage) message.error(msg);
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
    : `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      Client: SSO_CLIENT_CODE,
      ...(init.headers ?? {}),
    },
  });
}
