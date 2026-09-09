import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { RETRYABLE_SERVICE_UNAVAILABLE } from "@iam/contracts";

/** A valid object submitted outside its intended request must remain recoverable. */
export class CustomSsoRequestMismatchError extends AuthzUnauthorizedError {
  constructor() {
    super("未登录");
    this.name = "CustomSsoRequestMismatchError";
  }
}

export class CustomSsoConfigurationUnavailableError extends Error {
  readonly retryability = RETRYABLE_SERVICE_UNAVAILABLE;

  constructor(options?: { cause?: unknown }) {
    super("Custom SSO configuration is temporarily unavailable", options);
    this.name = "CustomSsoConfigurationUnavailableError";
  }
}
