import type { ServiceStatusCode } from "@iam/contracts";
import { ApiErrorCode } from "@iam/contracts";
import { INTERNAL_SERVER_ERROR } from "../core/http-status-codes";

export interface CustomErrorOptions {
  code?: ApiErrorCode | string;
  httpStatus?: number;
  legacyCode?: ServiceStatusCode | number;
}

export class CustomError extends Error {
  public code: ApiErrorCode | string;
  public httpStatus: number;
  public legacyCode?: ServiceStatusCode | number;

  constructor(message: string = "服务器内部错误", codeOrOptions: ApiErrorCode | string | number | CustomErrorOptions = {}) {
    super(message);
    this.name = "CustomError";

    if (typeof codeOrOptions === "object") {
      this.code = codeOrOptions.code ?? ApiErrorCode.InternalError;
      this.httpStatus = codeOrOptions.httpStatus ?? INTERNAL_SERVER_ERROR;
      this.legacyCode = codeOrOptions.legacyCode;
      return;
    }

    if (typeof codeOrOptions === "number") {
      this.code = ApiErrorCode.InternalError;
      this.httpStatus = codeOrOptions >= 400 && codeOrOptions < 600 ? codeOrOptions : INTERNAL_SERVER_ERROR;
      this.legacyCode = codeOrOptions;
      return;
    }

    this.code = codeOrOptions;
    this.httpStatus = INTERNAL_SERVER_ERROR;
  }
}
