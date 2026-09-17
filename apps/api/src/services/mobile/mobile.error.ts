import { INTERNAL_SERVER_ERROR, SERVICE_UNAVAILABLE, TOO_MANY_REQUESTS } from "@iam/api-core/core/http-status-codes";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { ApiErrorCode } from "@iam/contracts";

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
