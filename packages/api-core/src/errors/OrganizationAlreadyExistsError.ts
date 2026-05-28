import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class OrganizationAlreadyExistsError extends CustomError {
  constructor(message: string = "待创建组织已存在") {
    super(message, {
      code: ApiErrorCode.OrganizationAlreadyExists,
      httpStatus: CONFLICT,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "OrganizationAlreadyExistsError";
  }
}
