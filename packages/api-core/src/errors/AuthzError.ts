import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { INTERNAL_SERVER_ERROR } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class AuthzError extends CustomError {
  public httpCode: number;
  constructor(
    message: string,
    code: ApiErrorCode | string = ApiErrorCode.InternalError,
    httpStatus: number = INTERNAL_SERVER_ERROR,
    legacyCode: ServiceStatusCode | number = ServiceStatusCode.Failure,
  ) {
    super(message, { code, httpStatus, legacyCode });
    this.name = "AuthzError";
    this.httpCode = httpStatus;
  }
}
