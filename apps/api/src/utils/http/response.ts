import { ServiceStatusCode } from "@/enums/service.status";

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
