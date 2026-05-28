import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class InvalidLoginCredentialError extends CustomError {
  constructor(message: string = "登录凭证无效") {
    super(message, {
      code: ApiErrorCode.InvalidLoginCredential,
      httpStatus: BAD_REQUEST,
      legacyCode: ServiceStatusCode.Failure,
    });
    this.name = "InvalidLoginCredentialError";
  }
}
