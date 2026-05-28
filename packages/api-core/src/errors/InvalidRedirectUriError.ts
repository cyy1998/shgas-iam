import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class InvalidRedirectUriError extends CustomError {
  constructor(message: string = "非法重定向地址") {
    super(message, {
      code: ApiErrorCode.InvalidRedirectUri,
      httpStatus: BAD_REQUEST,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "InvalidRedirectUriError";
  }
}
