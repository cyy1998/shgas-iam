import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class PrivilegeAlreadyDelegatedError extends CustomError {
  constructor(message: string = "以下权限已被授权") {
    super(message, {
      code: ApiErrorCode.PrivilegeAlreadyDelegated,
      httpStatus: CONFLICT,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "PrivilegeAlreadyDelegatedError";
  }
}
