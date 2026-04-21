import { message } from "antd";

export class ServiceError extends Error {
  public code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

export async function unwrap<T>(
  response: Response | Promise<Response>,
): Promise<T> {
  const res = await response;
  if (!res.ok) {
    throw new ServiceError(`HTTP ${res.status}`, res.status);
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  if (body.code !== 200) {
    throw new ServiceError(body.message || "请求失败", body.code);
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
  message.error("未知错误");
}
