import { ApiErrorCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class MobileAlreadyExistsError extends CustomError {
  constructor(message: string = "手机号已存在") {
    super(message, {
      code: ApiErrorCode.MobileAlreadyExists,
      httpStatus: CONFLICT,
    });
    this.name = "MobileAlreadyExistsError";
  }
}
