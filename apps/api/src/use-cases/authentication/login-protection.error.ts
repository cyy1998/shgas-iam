import { SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { CustomError } from "@iam/api-core/errors";
import { ApiErrorCode } from "@iam/contracts";

export class LoginProtectionUnavailableError extends CustomError {
  constructor(cause?: unknown) {
    super("登录保护服务暂时不可用，请稍后再试", {
      code: ApiErrorCode.LoginProtectionUnavailable,
      httpStatus: SERVICE_UNAVAILABLE,
    });
    this.name = "LoginProtectionUnavailableError";
    this.cause = cause;
  }
}
