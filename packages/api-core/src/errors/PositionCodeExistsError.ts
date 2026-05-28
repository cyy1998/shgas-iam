import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { CONFLICT } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class PositionCodeExistsError extends CustomError {
  constructor(message: string = "岗位编码已存在") {
    super(message, {
      code: ApiErrorCode.PositionCodeExists,
      httpStatus: CONFLICT,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "PositionCodeExistsError";
  }
}
