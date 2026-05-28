import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class WeakPasswordError extends CustomError {
  constructor(message: string = "新密码强度过低") {
    super(message, {
      code: ApiErrorCode.WeakPassword,
      httpStatus: BAD_REQUEST,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "WeakPasswordError";
  }
}
