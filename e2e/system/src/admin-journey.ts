import type { PlaywrightJourneyRuntimeOptions } from "./playwright-journey.ts";
import { createPlaywrightJourneyOperations } from "./playwright-journey.ts";
import { createE2EScenarioInternalApiKey } from "./seed.ts";

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
      IAM_E2E_ADMIN_PRIVILEGE_CODE: scenario.adminPrivilegeCode,
      IAM_E2E_ADMIN_ROLE_CODE: scenario.adminRoleCode,
      IAM_E2E_DELEGATEE_USERNAME: scenario.delegateeUsername,
      IAM_E2E_DISABLED_USERNAME: scenario.disabledUsername,
      IAM_E2E_CUSTOM_SSO_CLIENT_CODE: scenario.customSsoClientCode,
      IAM_E2E_CUSTOM_SSO_REDIRECT_URI:
        `${descriptor.origin}/e2e/custom-sso/*`,
      IAM_E2E_INTERNAL_API_KEY:
        createE2EScenarioInternalApiKey(descriptor.runId),
      IAM_E2E_ORGANIZATION_CODE: scenario.organizationCode,
      IAM_E2E_PAUSED_USERNAME: scenario.pausedUsername,
      IAM_E2E_POSITION_CODE: scenario.positionCode,
      IAM_E2E_RESPONSIBILITY_TARGET_ORGANIZATION_CODE:
        scenario.responsibilityTargetOrganizationCode,
      IAM_E2E_RESPONSIBILITY_HOLDER_POSITION_CODE:
        scenario.responsibilityHolderPositionCode,
    }),
  });
}
