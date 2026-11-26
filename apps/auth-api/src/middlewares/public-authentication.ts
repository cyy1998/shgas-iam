import { mapCustomSsoRetryableError } from "@iam/api-core/http/custom-sso-retryable";
import {
  createPublicAuthenticationHandler,
  type PublicAuthenticationDeps,
} from "@iam/api-core/middlewares/public-authentication";
import {
  CustomSsoClientDeliveryUnauthorizedError,
  CustomSsoRequestMismatchError,
  type CustomSsoSubjectDeliveryCapability,
} from "@iam/custom-sso";

export function createApiPublicAuthenticationHandler(
  deps: Omit<
    PublicAuthenticationDeps<CustomSsoSubjectDeliveryCapability>,
    "mapRetryableError" | "shouldPreserveSessionCookie"
  >,
) {
  return createPublicAuthenticationHandler({
    ...deps,
    mapRetryableError: mapCustomSsoRetryableError,
    shouldPreserveSessionCookie: (error, clientCode) =>
      error instanceof CustomSsoRequestMismatchError ||
      (clientCode === "iam" && error instanceof CustomSsoClientDeliveryUnauthorizedError),
  });
}
