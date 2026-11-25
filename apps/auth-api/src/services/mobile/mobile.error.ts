import { ApiErrorCode } from "@iam/contracts";
import { BAD_REQUEST, INTERNAL_SERVER_ERROR, SERVICE_UNAVAILABLE, TOO_MANY_REQUESTS } from "@iam/contracts/http";
import { CustomError } from "@iam/runtime/errors";

export class SmsCooldownError extends CustomError {
  constructor(public readonly retryAfterSeconds: number) {
    super("短信发送过于频繁，请稍后重试", { code: ApiErrorCode.SmsCooldown, httpStatus: TOO_MANY_REQUESTS });
    this.name = "SmsCooldownError";
  }
}

export class SmsSendFailedError extends CustomError {
  constructor(public readonly retryAfterSeconds: number) {
    super("短信发送失败，请稍后重试", { code: ApiErrorCode.SmsSendFailed, httpStatus: INTERNAL_SERVER_ERROR });
    this.name = "SmsSendFailedError";
  }
}

export class SmsUnavailableError extends CustomError {
  constructor() {
    super("短信服务暂时不可用，请稍后重试", { code: ApiErrorCode.SmsUnavailable, httpStatus: SERVICE_UNAVAILABLE });
    this.name = "SmsUnavailableError";
  }
}

export class InvalidVerificationCodeError extends CustomError {
  constructor(message: string = "验证码错误") {
    super(message, {
      code: ApiErrorCode.InvalidVerificationCode,
      httpStatus: BAD_REQUEST,
    });
    this.name = "InvalidVerificationCodeError";
  }
}
