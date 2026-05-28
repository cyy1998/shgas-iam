import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class EmploymentNotEditableError extends CustomError {
  constructor(message: string = "已结束的雇佣关系不能修改") {
    super(message, {
      code: ApiErrorCode.EmploymentNotEditable,
      httpStatus: CONFLICT,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "EmploymentNotEditableError";
  }
}
