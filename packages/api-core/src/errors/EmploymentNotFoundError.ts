import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { NOT_FOUND } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class EmploymentNotFoundError extends CustomError {
  constructor(message: string = "雇佣关系不存在") {
    super(message, {
      code: ApiErrorCode.EmploymentNotFound,
      httpStatus: NOT_FOUND,
      legacyCode: ServiceStatusCode.NotFound,
    });
    this.name = "EmploymentNotFoundError";
  }
}
