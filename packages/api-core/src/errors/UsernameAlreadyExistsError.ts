import { ApiErrorCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class UsernameAlreadyExistsError extends CustomError {
  constructor(message: string = "用户名已存在") {
    super(message, {
      code: ApiErrorCode.UsernameAlreadyExists,
      httpStatus: CONFLICT,
    });
    this.name = "UsernameAlreadyExistsError";
  }
}
