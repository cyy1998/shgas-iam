import { ApiErrorCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class EmploymentAlreadyExistsError extends CustomError {
  constructor(message: string = "相同任职关系已存在") {
    super(message, {
      code: ApiErrorCode.EmploymentAlreadyExists,
      httpStatus: CONFLICT,
    });
    this.name = "EmploymentAlreadyExistsError";
  }
}
