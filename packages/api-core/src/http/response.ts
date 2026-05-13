import { ServiceStatusCode } from "@iam/contracts";

export function makeResponse(code: number = 200, data: unknown = null, message: string = "success"): any {
  return {
    code,
    data,
    message,
  };
}

export function ok(data: unknown = null) {
  return makeResponse(ServiceStatusCode.Success, data, "success");
}

export function fail(code: ServiceStatusCode, message: string = "fail") {
  return makeResponse(code, null, message);
}
