export type ResponseCode = number | string;

export function makeResponse(
  code: ResponseCode = 200,
  data: unknown = null,
  message: string = "success",
): any {
  return {
    code,
    data,
    message,
  };
}

export function ok(data: unknown = null) {
  return makeResponse(200, data, "success");
}

export function fail(code: ResponseCode, message: string = "fail", data: unknown = null) {
  return makeResponse(code, data, message);
}
