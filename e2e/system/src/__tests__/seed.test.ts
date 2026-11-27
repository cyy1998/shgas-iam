import { describe, expect, test } from "bun:test";
import { createE2ESeedSubjects, type E2EScenarioOwner, seedE2EScenario } from "../seed.ts";

describe("E2E scenario seed", () => {
  test("establishes the fixed scenario through its owner and returns only run-scoped references", async () => {
    const established: Parameters<E2EScenarioOwner["establish"]>[0][] = [];
    const owner: E2EScenarioOwner = {
      async establish(input) {
        established.push(input);
        return {
          adminMixedRoleAssignmentId: 45,
          hiddenResponsibilityAssignmentId: 41,
          hrSecondScopeRoleAssignmentId: 42,
          outsideResponsibilityHolderEmploymentId: 43,
          responsibilityHolderEmploymentId: 44,
        };
      },
    };

    const result = await seedE2EScenario({
      adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
      canonicalOrigin: "http://127.0.0.1:43123",
      internalOrigin: "http://internal.iam.localhost:43123",
      owner,
      random: scenarioRandom(),
      runId: "20260806123000000-a1b2c3d4",
    });

    expect(result).toEqual({
      version: 1,
      runId: "20260806123000000-a1b2c3d4",
      canonicalOrigin: "http://127.0.0.1:43123",
      internalOrigin: "http://internal.iam.localhost:43123",
      adminSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123451",
      adminUsername: "e2e-admin-123000000-a1b2c3d4",
      hrAdminSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123452",
      hrAdminUsername: "e2e-hr-admin-123000000-a1b2c3d4",
      hrAdminUpdatedName: "E2E HR Admin Updated 123000000-a1b2c3d4",
      delegateeSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123453",
      delegateeUsername: "e2e-delegatee-123000000-a1b2c3d4",
      pausedSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123454",
      pausedUsername: "e2e-paused-123000000-a1b2c3d4",
      disabledSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123455",
      disabledUsername: "e2e-disabled-123000000-a1b2c3d4",
      organizationCode: "e2e-org-123000000-a1b2c3d4",
      responsibilityHolderOrganizationCode: "e2e-holder-org-123000000-a1b2c3d4",
      responsibilityTargetOrganizationCode: "e2e-resp-target-123000000-a1b2c3d4",
      hrSecondScopeRootOrganizationCode: "e2e-hr-root-123000000-a1b2c3d4",
      hrResponsibilityTargetOrganizationCode: "e2e-hr-target-123000000-a1b2c3d4",
      positionCode: "e2e-pos-123000000-a1b2c3d4",
      globalPositionCode: "e2e-global-pos-123000000-a1b2c3d4",
      responsibilityHolderPositionCode: "e2e-resp-pos-123000000-a1b2c3d4",
      outsideResponsibilityHolderPositionCode: "e2e-outside-resp-pos-123000000-a1b2c3d4",
      noScopeHrAdminSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123456",
      noScopeHrAdminUsername: "e2e-no-scope-hr-123000000-a1b2c3d4",
      smsBindingSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123457",
      adminMixedRoleAssignmentId: 45,
      hiddenResponsibilityAssignmentId: 41,
      hrSecondScopeRoleAssignmentId: 42,
      outsideResponsibilityHolderEmploymentId: 43,
      responsibilityHolderEmploymentId: 44,
      adminRoleCode: "iam:admin",
      hrAdminRoleCode: "iam:hr-admin",
      adminClientCode: "iam-admin",
      adminRedirectUri: "http://127.0.0.1:43123/iam-admin/*",
      customSsoClientCode: "e2e-custom-123000000-a1b2c3d4",
      customSsoRedirectUri: "http://127.0.0.1:43123/e2e/custom-sso/*",
      internalClientCode: "e2e-internal-123000000-a1b2c3d4",
      oidcClientCode: "e2e-oidc-123000000-a1b2c3d4",
      oidcRedirectUri: "http://127.0.0.1:43123/e2e/oidc/callback",
      oidcPostLogoutRedirectUri: "http://127.0.0.1:43123/e2e/oidc/logged-out",
    });
    expect(established).toHaveLength(1);
    expect(established[0]).toMatchObject({
      adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
      internalApiKey: "iam-e2e-internal-api-key-123000000-a1b2c3d4",
      gatewayApiKey: "iam-e2e-gateway-api-key-123000000-a1b2c3d4",
    });
    expect(result.adminClientCode).not.toBe(result.customSsoClientCode);
    expect(JSON.stringify(result)).not.toMatch(/password|token|secret/iu);
    expect(createE2ESeedSubjects(result)).toEqual([
      { subjectIdentifier: result.adminSubjectIdentifier, state: "enabled" },
      { subjectIdentifier: result.hrAdminSubjectIdentifier, state: "enabled" },
      { subjectIdentifier: result.delegateeSubjectIdentifier, state: "enabled" },
      { subjectIdentifier: result.pausedSubjectIdentifier, state: "disabled" },
      { subjectIdentifier: result.disabledSubjectIdentifier, state: "disabled" },
      { subjectIdentifier: result.noScopeHrAdminSubjectIdentifier, state: "enabled" },
      { subjectIdentifier: result.smsBindingSubjectIdentifier, state: "enabled" },
    ]);
  });
});

function scenarioRandom() {
  let next = 0;
  return { uuid: () => `3b766c91-1daa-4c09-89e4-ea87ad12345${++next}` };
}
