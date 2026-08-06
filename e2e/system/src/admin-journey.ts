import type { PlaywrightJourneyRuntimeOptions } from "./playwright-journey.ts";
import { createPlaywrightJourneyOperations } from "./playwright-journey.ts";

export type CreateAdminJourneyOperationsOptions
  = PlaywrightJourneyRuntimeOptions;

export function createAdminJourneyOperations(
  options: CreateAdminJourneyOperationsOptions,
) {
  return createPlaywrightJourneyOperations({
    ...options,
    specPath: "admin-custom-sso.spec.ts",
    environment: (descriptor, scenario) => ({
      IAM_E2E_ADMIN_CLIENT_CODE: scenario.adminClientCode,
      IAM_E2E_CUSTOM_SSO_CLIENT_CODE: scenario.customSsoClientCode,
      IAM_E2E_CUSTOM_SSO_REDIRECT_URI:
        `${descriptor.origin}/e2e/custom-sso/*`,
    }),
  });
}
