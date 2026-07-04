export type ResponseCode = number | string;

export interface ApiEnvelope<TData = null, TCode extends ResponseCode = ResponseCode> {
  code: TCode;
  data: TData;
  message: string;
}

export function makeResponse(): ApiEnvelope<null, 200>;
export function makeResponse<TCode extends ResponseCode>(code: TCode): ApiEnvelope<null, TCode>;
export function makeResponse(
  code: ResponseCode,
  data: undefined,
  message?: string,
): ApiEnvelope<null, ResponseCode>;
export function makeResponse<TData, TCode extends ResponseCode>(
  code: TCode,
  data: TData,
  message?: string,
): ApiEnvelope<TData, TCode>;
export function makeResponse<TData, TCode extends ResponseCode>(
  code: TCode = 200 as TCode,
  data?: TData,
  message: string = "success",
): ApiEnvelope<TData | null, TCode> {
  return {
    code,
    data: data === undefined ? null : data,
    message,
  };
}

export function ok(): ApiEnvelope<null, 200>;
export function ok(data: undefined): ApiEnvelope<null, 200>;
export function ok<TData>(data: TData): ApiEnvelope<TData, 200>;
export function ok<TData>(data?: TData): ApiEnvelope<TData | null, 200> {
  const responseData: TData | null = data === undefined ? null : data;
  return makeResponse(200, responseData, "success");
}

export function fail<TCode extends ResponseCode>(code: TCode, message?: string): ApiEnvelope<null, TCode>;
export function fail<TCode extends ResponseCode>(
  code: TCode,
  message: string,
  data: undefined,
): ApiEnvelope<null, TCode>;
export function fail<TData, TCode extends ResponseCode>(
  code: TCode,
  message: string,
  data: TData,
): ApiEnvelope<TData, TCode>;
export function fail<TData, TCode extends ResponseCode>(
  code: TCode,
  message: string = "fail",
  data?: TData,
): ApiEnvelope<TData | null, TCode> {
  const responseData: TData | null = data === undefined ? null : data;
  return makeResponse(code, responseData, message);
}
