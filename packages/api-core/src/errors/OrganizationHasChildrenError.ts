import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class OrganizationHasChildrenError extends CustomError {
  constructor(message: string = "该组织下存在子组织，无法删除") {
    super(message, {
      code: ApiErrorCode.OrganizationHasChildren,
      httpStatus: CONFLICT,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "OrganizationHasChildrenError";
  }
}
