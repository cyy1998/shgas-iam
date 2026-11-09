import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST } from "@iam/contracts/http";
import { CustomError } from "@iam/runtime/errors";

export class LoginFailedError extends CustomError {
  constructor(message: string = "登录失败") {
    super(message, {
      code: ApiErrorCode.LoginFailed,
      httpStatus: BAD_REQUEST,
    });
    this.name = "LoginFailedError";
  }
}
