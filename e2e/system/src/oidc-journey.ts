import type { PlaywrightJourneyRuntimeOptions } from "./playwright-journey.ts";
import { createPlaywrightJourneyOperations } from "./playwright-journey.ts";
import { createE2EScenarioInternalApiKey } from "./seed.ts";

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
      IAM_E2E_DUAL_ONLY: descriptor.internalOrigin ? "1" : "0",
      IAM_E2E_OIDC_CLIENT_CODE: scenario.oidcClientCode,
      IAM_E2E_CUSTOM_CLIENT_CODE: `${scenario.customSsoClientCode}-dual`,
      IAM_E2E_OIDC_REDIRECT_URI:
        `${descriptor.origin}/e2e/oidc/callback`,
      IAM_E2E_INTERNAL_API_KEY:
        createE2EScenarioInternalApiKey(descriptor.runId),
      IAM_E2E_RESPONSIBILITY_TARGET_ORGANIZATION_CODE:
        scenario.responsibilityTargetOrganizationCode,
      IAM_E2E_RESPONSIBILITY_HOLDER_POSITION_CODE:
        scenario.responsibilityHolderPositionCode,
    }),
  });
}
