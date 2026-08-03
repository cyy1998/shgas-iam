import {
  ApiErrorCode,
  RETRYABLE_SERVICE_UNAVAILABLE,
} from "@iam/contracts";

export class SubjectProjectionNotReadyError extends Error {
  public readonly code = ApiErrorCode.SubjectProjectionNotReady;
  public readonly retryability = RETRYABLE_SERVICE_UNAVAILABLE;

  constructor() {
    super("Subject projection is not ready");
    this.name = "SubjectProjectionNotReadyError";
  }
}
