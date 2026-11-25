import { createCustomSsoRetryableErrorMapper } from "@iam/api-core/http/custom-sso-retryable";
import { ClientSnapshotUnavailableError } from "@iam/client-snapshot";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { ApiErrorCode } from "@iam/contracts";
import { CustomSsoAdmissionUnavailableError, CustomSsoTrafficGateUnavailableError } from "@iam/custom-sso";

export const mapCustomSsoRetryableError = createCustomSsoRetryableErrorMapper({
  classifyUnavailable(error) {
    if (
      error instanceof CustomSsoAdmissionUnavailableError ||
      error instanceof CustomSsoTrafficGateUnavailableError ||
      error instanceof ClientSnapshotUnavailableError
    ) {
      return ApiErrorCode.InternalError;
    }
    if (error instanceof SubjectProjectionNotReadyError) return ApiErrorCode.SubjectProjectionNotReady;
    return undefined;
  },
});
