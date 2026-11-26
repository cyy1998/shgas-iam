import { ApiErrorCode, isRetryableServiceUnavailable } from "@iam/contracts";
import { SERVICE_UNAVAILABLE } from "@iam/contracts/http";
import { AuthzMaintenanceError, CustomError } from "@iam/runtime/errors";
import { SubjectAccessUnavailableError } from "@iam/subject-access";

export interface MapCustomSsoRetryableErrorOptions {
  readonly retryAfterSeconds: number;
}

type RetryableUnavailableCode =
  | ApiErrorCode.InternalError
  | ApiErrorCode.SubjectAccessUnavailable
  | ApiErrorCode.SubjectProjectionNotReady;

class CustomSsoRetryableUnavailableError extends CustomError {
  public readonly retryAfterSeconds: number;

  constructor(code: RetryableUnavailableCode | ApiErrorCode.Maintenance, message: string, retryAfterSeconds: number) {
    super(message, {
      code,
      httpStatus: SERVICE_UNAVAILABLE,
    });
    this.name = "CustomSsoRetryableUnavailableError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const unavailableMessages: Record<RetryableUnavailableCode, string> = {
  [ApiErrorCode.InternalError]: "服务暂时不可用",
  [ApiErrorCode.SubjectAccessUnavailable]: "账号访问状态暂时不可用",
  [ApiErrorCode.SubjectProjectionNotReady]: "主体信息暂未就绪",
};

export function mapCustomSsoRetryableError(error: unknown, { retryAfterSeconds }: MapCustomSsoRetryableErrorOptions) {
  if (error instanceof AuthzMaintenanceError) {
    assertRetryAfterSeconds(retryAfterSeconds);
    return new CustomSsoRetryableUnavailableError(ApiErrorCode.Maintenance, error.message, retryAfterSeconds);
  }

  const code = classifyUnavailable(error);
  if (code === undefined) return error;

  assertRetryAfterSeconds(retryAfterSeconds);
  return new CustomSsoRetryableUnavailableError(code, unavailableMessages[code], retryAfterSeconds);
}

function classifyUnavailable(error: unknown): RetryableUnavailableCode | undefined {
  if (error instanceof SubjectAccessUnavailableError) return ApiErrorCode.SubjectAccessUnavailable;
  if (!isRetryableServiceUnavailable(error)) return undefined;
  return "code" in error && error.code === ApiErrorCode.SubjectProjectionNotReady
    ? ApiErrorCode.SubjectProjectionNotReady
    : ApiErrorCode.InternalError;
}

function assertRetryAfterSeconds(retryAfterSeconds: number) {
  if (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds <= 0)
    throw new Error("Custom SSO retryAfterSeconds must be a positive safe integer");
}
