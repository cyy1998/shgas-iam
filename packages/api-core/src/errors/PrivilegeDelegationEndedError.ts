import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class PrivilegeDelegationEndedError extends CustomError {
  constructor(message: string = "该委托已结束，不允许再修改") {
    super(message, {
      code: ApiErrorCode.PrivilegeDelegationEnded,
      httpStatus: CONFLICT,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "PrivilegeDelegationEndedError";
  }
}
