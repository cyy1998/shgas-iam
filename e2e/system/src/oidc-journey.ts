import type { PlaywrightJourneyRuntimeOptions } from "./playwright-journey.ts";
import { createPlaywrightJourneyOperations } from "./playwright-journey.ts";

export type CreateOidcJourneyOperationsOptions
  = PlaywrightJourneyRuntimeOptions;

export function createOidcJourneyOperations(
  options: CreateOidcJourneyOperationsOptions,
) {
  return createPlaywrightJourneyOperations({
    ...options,
    specPath: "oidc-pkce.spec.ts",
    environment: (descriptor, scenario) => ({
      IAM_E2E_JOURNEY: "oidc",
      IAM_E2E_OIDC_CLIENT_CODE: scenario.oidcClientCode,
      IAM_E2E_OIDC_REDIRECT_URI:
        `${descriptor.origin}/e2e/oidc/callback`,
    }),
  });
}
