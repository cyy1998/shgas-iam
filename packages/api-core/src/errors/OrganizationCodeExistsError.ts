import { ApiErrorCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class OrganizationCodeExistsError extends CustomError {
  constructor(message: string = "组织编码已存在") {
    super(message, {
      code: ApiErrorCode.OrganizationCodeExists,
      httpStatus: CONFLICT,
    });
    this.name = "OrganizationCodeExistsError";
  }
}
