import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class BadRequestError extends CustomError {
  constructor(message: string = "请求参数错误") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: BAD_REQUEST,
    });
    this.name = "BadRequestError";
  }
}
