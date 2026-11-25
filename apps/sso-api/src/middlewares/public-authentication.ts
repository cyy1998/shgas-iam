import {
  createPublicAuthenticationHandler,
  type PublicAuthenticationDeps,
} from "@iam/api-core/middlewares/public-authentication";
import {
  CustomSsoClientDeliveryUnauthorizedError,
  CustomSsoRequestMismatchError,
  type CustomSsoSubjectDeliveryCapability,
} from "@iam/custom-sso";
import { mapCustomSsoRetryableError } from "./custom-sso-retryable.error";

export function createSsoPublicAuthenticationHandler(
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
