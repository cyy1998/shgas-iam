import { ApiErrorCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class OrganizationHasEmploymentError extends CustomError {
  constructor(message: string = "该组织下存在雇佣关系，无法删除") {
    super(message, {
      code: ApiErrorCode.OrganizationHasEmployment,
      httpStatus: CONFLICT,
    });
    this.name = "OrganizationHasEmploymentError";
  }
}
