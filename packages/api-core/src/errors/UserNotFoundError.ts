import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { NOT_FOUND } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class UserNotFoundError extends CustomError {
  constructor(message: string = "用户不存在") {
    super(message, {
      code: ApiErrorCode.UserNotFound,
      httpStatus: NOT_FOUND,
      legacyCode: ServiceStatusCode.UserNotExisting,
    });
    this.name = "UserNotFoundError";
  }
}
