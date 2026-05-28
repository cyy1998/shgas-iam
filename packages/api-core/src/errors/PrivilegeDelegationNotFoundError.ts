import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { NOT_FOUND } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class PrivilegeDelegationNotFoundError extends CustomError {
  constructor(message: string = "委托记录不存在") {
    super(message, {
      code: ApiErrorCode.PrivilegeDelegationNotFound,
      httpStatus: NOT_FOUND,
      legacyCode: ServiceStatusCode.NotFound,
    });
    this.name = "PrivilegeDelegationNotFoundError";
  }
}
