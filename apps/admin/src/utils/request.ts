import type { ApiErrorCode } from '@iam/contracts';
import { message } from 'antd';

export class ServiceError extends Error {
  public code: ApiErrorCode | number | string;
  constructor(
    msg: string,
    code: ApiErrorCode | number | string,
  ) {
    super(msg);
    this.name = 'ServiceError';
    this.code = code;
  }
}

type ApiEnvelope<T> = {
  code: ApiErrorCode | number | string;
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
    );
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  if (body.code !== 200) {
    throw new ServiceError(body.message || '请求失败', body.code);
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
