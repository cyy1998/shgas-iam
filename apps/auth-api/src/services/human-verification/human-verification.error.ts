import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST } from "@iam/contracts/http";
import { CustomError } from "@iam/runtime/errors";

export class InvalidHumanVerificationSiteError extends CustomError {
  constructor(message: string = "无效人机校验站点") {
    super(message, {
      code: ApiErrorCode.InvalidHumanVerificationSite,
      httpStatus: BAD_REQUEST,
    });
    this.name = "InvalidHumanVerificationSiteError";
  }
}

export class HumanVerificationRequiredError extends CustomError {
  readonly #imageCaptchaTicket?: string;

  constructor(message: string = "需要人机校验", imageCaptchaTicket?: string) {
    super(message, {
      code: ApiErrorCode.HumanVerificationRequired,
      httpStatus: BAD_REQUEST,
    });
    this.name = "HumanVerificationRequiredError";
    this.#imageCaptchaTicket = imageCaptchaTicket;
  }

  get imageCaptchaTicket() {
    return this.#imageCaptchaTicket;
  }
}

export function isHumanVerificationRequiredError(error: unknown): boolean {
  return (
    error instanceof HumanVerificationRequiredError ||
    (error instanceof CustomError && error.code === ApiErrorCode.HumanVerificationRequired)
  );
}
