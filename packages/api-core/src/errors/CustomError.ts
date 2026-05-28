import { ApiErrorCode } from "@iam/contracts";
import { INTERNAL_SERVER_ERROR } from "../core/http-status-codes";

export interface CustomErrorOptions {
  code?: ApiErrorCode | string;
  httpStatus?: number;
}

export class CustomError extends Error {
  public code: ApiErrorCode | string;
  public httpStatus: number;

  constructor(message: string = "服务器内部错误", codeOrOptions: ApiErrorCode | string | CustomErrorOptions = {}) {
    super(message);
    this.name = "CustomError";

    if (typeof codeOrOptions === "object") {
      this.code = codeOrOptions.code ?? ApiErrorCode.InternalError;
      this.httpStatus = codeOrOptions.httpStatus ?? INTERNAL_SERVER_ERROR;
      return;
    }

    this.code = codeOrOptions;
    this.httpStatus = INTERNAL_SERVER_ERROR;
  }
}
