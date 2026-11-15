import type { PlaywrightJourneyRuntimeOptions } from "./playwright-journey.ts";
import { createPlaywrightJourneyOperations } from "./playwright-journey.ts";
import { createE2EScenarioInternalApiKey } from "./seed.ts";

export type CreateOidcJourneyOperationsOptions = PlaywrightJourneyRuntimeOptions;

export function createOidcJourneyOperations(options: CreateOidcJourneyOperationsOptions) {
  return createPlaywrightJourneyOperations({
    ...options,
    specPaths: ["oidc-pkce.spec.ts", "wecom-qr.spec.ts", "wecom-qr-oidc.spec.ts", "wecom-qr-binding.spec.ts"],
    environment: (descriptor, scenario) => ({
      IAM_E2E_JOURNEY: "oidc",
      IAM_E2E_WECHAT_QR_MOBILE_ORIGIN: descriptor.wecomMobileOrigin,
      IAM_E2E_OIDC_CLIENT_CODE: scenario.oidcClientCode,
      IAM_E2E_DELEGATEE_USERNAME: scenario.delegateeUsername,
      IAM_E2E_HR_ADMIN_USERNAME: scenario.hrAdminUsername,
      IAM_E2E_NO_SCOPE_HR_ADMIN_USERNAME: scenario.noScopeHrAdminUsername,
      IAM_E2E_CUSTOM_CLIENT_CODE: `${scenario.customSsoClientCode}-dual`,
      IAM_E2E_BUSINESS_CLIENT_CODE: `${scenario.customSsoClientCode}-business`,
      IAM_E2E_OIDC_REDIRECT_URI: `${descriptor.origin}/e2e/oidc/callback`,
      IAM_E2E_INTERNAL_API_KEY: createE2EScenarioInternalApiKey(descriptor.runId),
      IAM_E2E_ORGANIZATION_CODE: scenario.organizationCode,
      IAM_E2E_GLOBAL_POSITION_CODE: scenario.globalPositionCode,
    }),
  });
}
