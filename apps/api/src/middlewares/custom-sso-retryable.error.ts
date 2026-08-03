import { SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { CustomError } from "@iam/api-core/errors";
import { SubjectAccessUnavailableError } from "@iam/api-core/subject-access";
import {
  ApiErrorCode,
  isRetryableServiceUnavailable,
} from "@iam/contracts";

export interface MapCustomSsoRetryableErrorOptions {
  readonly retryAfterSeconds: number;
}

class CustomSsoRetryableUnavailableError extends CustomError {
  public readonly retryAfterSeconds: number;

  constructor(
    code: ApiErrorCode.SubjectAccessUnavailable
      | ApiErrorCode.SubjectProjectionNotReady,
    message: string,
    retryAfterSeconds: number,
  ) {
    super(message, {
      code,
      httpStatus: SERVICE_UNAVAILABLE,
    });
    this.name = "CustomSsoRetryableUnavailableError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function mapCustomSsoRetryableError(
  error: unknown,
  options: MapCustomSsoRetryableErrorOptions,
): unknown {
  if (!isRetryableServiceUnavailable(error))
    return error;
  if (!Number.isSafeInteger(options.retryAfterSeconds) || options.retryAfterSeconds <= 0)
    throw new Error("Custom SSO retryAfterSeconds must be a positive safe integer");
  return error instanceof SubjectAccessUnavailableError
    ? new CustomSsoRetryableUnavailableError(
        ApiErrorCode.SubjectAccessUnavailable,
        "账号访问状态暂时不可用",
        options.retryAfterSeconds,
      )
    : new CustomSsoRetryableUnavailableError(
        ApiErrorCode.SubjectProjectionNotReady,
        "主体信息暂未就绪",
        options.retryAfterSeconds,
      );
}
