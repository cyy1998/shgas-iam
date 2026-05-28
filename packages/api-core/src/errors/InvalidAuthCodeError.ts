import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { UNAUTHORIZED } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class InvalidAuthCodeError extends CustomError {
  constructor(message: string = "非法Code") {
    super(message, {
      code: ApiErrorCode.InvalidAuthCode,
      httpStatus: UNAUTHORIZED,
      legacyCode: ServiceStatusCode.Unauthorized,
    });
    this.name = "InvalidAuthCodeError";
  }
}
