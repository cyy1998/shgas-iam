import { ApiErrorCode, ServiceStatusCode } from '@iam/contracts';
import { message } from 'antd';

export class ServiceError extends Error {
  public code: ApiErrorCode | ServiceStatusCode | number | string;
  public legacyCode?: ServiceStatusCode | number;
  constructor(
    msg: string,
    code: ApiErrorCode | ServiceStatusCode | number | string,
    legacyCode?: ServiceStatusCode | number,
  ) {
    super(msg);
    this.name = 'ServiceError';
    this.code = code;
    this.legacyCode = legacyCode;
  }
}

type ApiEnvelope<T> = {
  code: ApiErrorCode | ServiceStatusCode | number | string;
  legacyCode?: ServiceStatusCode | number;
  message: string;
  data: T;
};

export async function unwrap<T>(
  response: Response | Promise<Response>,
): Promise<T> {
  const res = await response;
  if (!res.ok) {
    const body = await res
      .clone()
      .json()
      .catch(() => null) as ApiEnvelope<T> | null;
    throw new ServiceError(
      body?.message || `HTTP ${res.status}`,
      body?.code ?? res.status,
      body?.legacyCode,
    );
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  if (body.code !== ServiceStatusCode.Success) {
    throw new ServiceError(body.message || '请求失败', body.code, body.legacyCode);
  }
  return body.data;
}

export function handleError(err: unknown) {
  if (err instanceof ServiceError) {
    message.error(err.message);
    return;
  }
  if (err instanceof Error) {
    message.error(err.message);
    return;
  }
  message.error('未知错误');
}
