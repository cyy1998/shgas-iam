import { ApiErrorCode } from "@iam/contracts";
import { NOT_FOUND } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class PrivilegeNotFoundError extends CustomError {
  constructor(message: string = "权限不存在") {
    super(message, {
      code: ApiErrorCode.PrivilegeNotFound,
      httpStatus: NOT_FOUND,
    });
    this.name = "PrivilegeNotFoundError";
  }
}
