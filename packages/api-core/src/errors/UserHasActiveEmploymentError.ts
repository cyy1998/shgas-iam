import { ApiErrorCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class UserHasActiveEmploymentError extends CustomError {
  constructor(message: string = "该用户仍存在活跃雇佣，无法删除") {
    super(message, {
      code: ApiErrorCode.UserHasActiveEmployment,
      httpStatus: CONFLICT,
    });
    this.name = "UserHasActiveEmploymentError";
  }
}
