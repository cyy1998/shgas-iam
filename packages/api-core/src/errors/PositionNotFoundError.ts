import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { NOT_FOUND } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class PositionNotFoundError extends CustomError {
  constructor(message: string = "岗位不存在") {
    super(message, {
      code: ApiErrorCode.PositionNotFound,
      httpStatus: NOT_FOUND,
      legacyCode: ServiceStatusCode.NotFound,
    });
    this.name = "PositionNotFoundError";
  }
}
