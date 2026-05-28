import { ApiErrorCode } from "@iam/contracts";
import { INTERNAL_SERVER_ERROR } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class AuthzError extends CustomError {
  public httpCode: number;
  constructor(
    message: string,
    code: ApiErrorCode | string = ApiErrorCode.InternalError,
    httpStatus: number = INTERNAL_SERVER_ERROR,
  ) {
    super(message, { code, httpStatus });
    this.name = "AuthzError";
    this.httpCode = httpStatus;
  }
}
