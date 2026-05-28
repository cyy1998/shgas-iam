import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class InvalidMobileError extends CustomError {
  constructor(message: string = "无效手机号") {
    super(message, {
      code: ApiErrorCode.InvalidMobile,
      httpStatus: BAD_REQUEST,
    });
    this.name = "InvalidMobileError";
  }
}
