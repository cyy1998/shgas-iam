import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { BAD_REQUEST } from "../core/http-status-codes";
import { CustomError } from "./CustomError";

export class HumanVerificationRequiredError extends CustomError {
  constructor(message: string = "需要人机校验") {
    super(message, {
      code: ApiErrorCode.HumanVerificationRequired,
      httpStatus: BAD_REQUEST,
      legacyCode: ServiceStatusCode.HumanVerificationRequired,
    });
    this.name = "HumanVerificationRequiredError";
  }
}

export function isHumanVerificationRequiredError(error: unknown): boolean {
  return error instanceof HumanVerificationRequiredError
    || (error instanceof CustomError
      && (error.code === ApiErrorCode.HumanVerificationRequired
        || error.legacyCode === ServiceStatusCode.HumanVerificationRequired));
}
