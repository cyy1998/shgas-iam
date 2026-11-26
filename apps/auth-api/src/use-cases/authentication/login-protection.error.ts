import { ApiErrorCode } from "@iam/contracts";
import { SERVICE_UNAVAILABLE } from "@iam/contracts/http";
import { CustomError } from "@iam/runtime/errors";

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
