import { RETRYABLE_SERVICE_UNAVAILABLE } from "@iam/contracts";

export class CustomSsoTrafficGateUnavailableError extends Error {
  public readonly retryability = RETRYABLE_SERVICE_UNAVAILABLE;

  constructor(options?: { cause?: unknown }) {
    super("Custom SSO client traffic state is temporarily unavailable", options);
    this.name = "CustomSsoTrafficGateUnavailableError";
  }
}
