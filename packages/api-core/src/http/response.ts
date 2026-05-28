import { ServiceStatusCode } from "@iam/contracts";

export type ResponseCode = number | string;

export function makeResponse(
  code: ResponseCode = ServiceStatusCode.Success,
  data: unknown = null,
  message: string = "success",
  legacyCode?: number,
): any {
  return {
    code,
    data,
    message,
    ...(legacyCode === undefined ? {} : { legacyCode }),
  };
}

export function ok(data: unknown = null) {
  return makeResponse(ServiceStatusCode.Success, data, "success");
}

export function fail(code: ResponseCode, message: string = "fail", legacyCode?: number) {
  return makeResponse(code, null, message, legacyCode);
}
