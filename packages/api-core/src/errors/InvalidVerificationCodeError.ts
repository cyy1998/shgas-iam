import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class InvalidVerificationCodeError extends CustomError {
  constructor(message: string = "验证码错误") {
    super(message, {
      code: ApiErrorCode.InvalidVerificationCode,
      httpStatus: BAD_REQUEST,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "InvalidVerificationCodeError";
  }
}
