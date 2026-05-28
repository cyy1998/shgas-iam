import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class InvalidSsoClientError extends CustomError {
  constructor(message: string = "非法Client") {
    super(message, {
      code: ApiErrorCode.InvalidSsoClient,
      httpStatus: BAD_REQUEST,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "InvalidSsoClientError";
  }
}
