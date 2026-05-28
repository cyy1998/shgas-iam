import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class InvalidOldPasswordError extends CustomError {
  constructor(message: string = "旧密码错误") {
    super(message, {
      code: ApiErrorCode.InvalidOldPassword,
      httpStatus: BAD_REQUEST,
    });
    this.name = "InvalidOldPasswordError";
  }
}
