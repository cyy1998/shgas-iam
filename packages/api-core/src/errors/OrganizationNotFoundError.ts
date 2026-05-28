import { ApiErrorCode } from "@iam/contracts";
import { NOT_FOUND } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class OrganizationNotFoundError extends CustomError {
  constructor(message: string = "组织不存在") {
    super(message, {
      code: ApiErrorCode.OrganizationNotFound,
      httpStatus: NOT_FOUND,
    });
    this.name = "OrganizationNotFoundError";
  }
}
