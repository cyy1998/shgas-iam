import type {
  E2EScenarioOwner,
  E2EScenarioReferences,
} from "./seed.ts";
import { CustomSsoClientMode, OidcClientType } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { seedE2EScenario } from "./seed.ts";

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
      async readBack(references) {
        return completeReadBack(references);
      },
    };

    const result = await seedE2EScenario({
      adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
      canonicalOrigin: "http://127.0.0.1:43123",
      owner,
      random: { uuid: () => "3b766c91-1daa-4c09-89e4-ea87ad123456" },
      runId: "20260806123000000-a1b2c3d4",
    });

    expect(result).toEqual({
      version: 1,
      runId: "20260806123000000-a1b2c3d4",
      canonicalOrigin: "http://127.0.0.1:43123",
      adminSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123456",
      adminUsername: "e2e-admin-123000000-a1b2c3d4",
      hrAdminSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123456",
      hrAdminUsername: "e2e-hr-admin-123000000-a1b2c3d4",
      hrAdminUpdatedName: "E2E HR Admin Updated 123000000-a1b2c3d4",
      delegateeSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123456",
      delegateeUsername: "e2e-delegatee-123000000-a1b2c3d4",
      pausedSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123456",
      pausedUsername: "e2e-paused-123000000-a1b2c3d4",
      disabledSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123456",
      disabledUsername: "e2e-disabled-123000000-a1b2c3d4",
      organizationCode: "e2e-org-123000000-a1b2c3d4",
      responsibilityHolderOrganizationCode:
        "e2e-holder-org-123000000-a1b2c3d4",
      responsibilityTargetOrganizationCode:
        "e2e-resp-target-123000000-a1b2c3d4",
      hrSecondScopeRootOrganizationCode:
        "e2e-hr-root-123000000-a1b2c3d4",
      hrResponsibilityTargetOrganizationCode:
        "e2e-hr-target-123000000-a1b2c3d4",
      positionCode: "e2e-pos-123000000-a1b2c3d4",
      globalPositionCode: "e2e-global-pos-123000000-a1b2c3d4",
      responsibilityHolderPositionCode:
        "e2e-resp-pos-123000000-a1b2c3d4",
      outsideResponsibilityHolderPositionCode:
        "e2e-outside-resp-pos-123000000-a1b2c3d4",
      noScopeHrAdminSubjectIdentifier:
        "3b766c91-1daa-4c09-89e4-ea87ad123456",
      noScopeHrAdminUsername:
        "e2e-no-scope-hr-123000000-a1b2c3d4",
      adminMixedRoleAssignmentId: 45,
      hiddenResponsibilityAssignmentId: 41,
      hrSecondScopeRoleAssignmentId: 42,
      outsideResponsibilityHolderEmploymentId: 43,
      responsibilityHolderEmploymentId: 44,
      adminRoleCode: "iam:admin",
      hrAdminRoleCode: "iam:hr-admin",
      adminPrivilegeCode: "e2e-privilege-123000000-a1b2c3d4",
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
    });
    expect(result.adminClientCode).not.toBe(result.customSsoClientCode);
    expect(JSON.stringify(result)).not.toMatch(/password|token|secret/iu);
  });

  test("rejects an applied result when production Subject Facts are missing", async () => {
    const owner: E2EScenarioOwner = {
      establish: async () => generatedReferences(),
      async readBack(references) {
        return {
          ...completeReadBack(references),
          subjectFacts: {
            ready: false,
            subjectIdentifier: "",
            sourceDirtyVersion: "",
            profileUsername: "",
            organizationCodes: [],
            positionCodes: [],
            clientCodes: [],
            roleCodes: [],
            responsibilityTypeCodes: [],
            responsibilityTargetOrganizationCodes: [],
          },
        };
      },
    };

    await expect(seedE2EScenario({
      adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
      canonicalOrigin: "http://127.0.0.1:43123",
      owner,
      random: { uuid: () => "3b766c91-1daa-4c09-89e4-ea87ad123456" },
      runId: "20260806123000000-a1b2c3d4",
    })).rejects.toThrow(
      "E2E scenario owner read-back did not confirm the complete fixed scenario",
    );
  });

  test("rejects Subject Facts published for a different Dirty Version", async () => {
    const owner: E2EScenarioOwner = {
      establish: async () => generatedReferences(),
      async readBack(references) {
        const readBack = completeReadBack(references);
        return {
          ...readBack,
          subjectFacts: {
            ...readBack.subjectFacts,
            sourceDirtyVersion: "2",
          },
        };
      },
    };

    await expect(seedE2EScenario({
      adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
      canonicalOrigin: "http://127.0.0.1:43123",
      owner,
      random: { uuid: () => "3b766c91-1daa-4c09-89e4-ea87ad123456" },
      runId: "20260806123000000-a1b2c3d4",
    })).rejects.toThrow(
      "E2E scenario owner read-back did not confirm the complete fixed scenario",
    );
  });
});

function completeReadBack(references: E2EScenarioReferences) {
  return {
    admin: {
      active: true,
      passwordConfigured: true,
      subjectIdentifier: references.adminSubjectIdentifier,
      username: references.adminUsername,
    },
    hrAdmin: {
      active: true,
      passwordConfigured: true,
      subjectIdentifier: references.hrAdminSubjectIdentifier,
      username: references.hrAdminUsername,
    },
    delegatee: {
      active: true,
      passwordConfigured: true,
      subjectIdentifier: references.delegateeSubjectIdentifier,
      username: references.delegateeUsername,
    },
    noScopeHrAdmin: {
      active: true,
      passwordConfigured: true,
      subjectIdentifier: references.noScopeHrAdminSubjectIdentifier,
      username: references.noScopeHrAdminUsername,
    },
    adminClient: {
      active: true,
      customSsoEnabled: true,
      clientCode: references.adminClientCode,
      mode: CustomSsoClientMode.Gateway,
      redirectUris: [references.adminRedirectUri],
    },
    customSsoClient: {
      active: true,
      customSsoEnabled: false,
      clientCode: references.customSsoClientCode,
      mode: null,
      redirectUris: [],
    },
    oidcClient: {
      active: true,
      clientCode: references.oidcClientCode,
      clientType: OidcClientType.Public,
      redirectUris: [references.oidcRedirectUri],
    },
    internalClient: {
      active: true,
      clientCode: "e2e-internal-123000000-a1b2c3d4",
    },
    organization: { active: true, code: references.organizationCode },
    responsibilityHolderOrganization: {
      active: true,
      code: references.responsibilityHolderOrganizationCode,
    },
    responsibilityTargetOrganization: {
      active: true,
      code: "e2e-resp-target-123000000-a1b2c3d4",
    },
    hrSecondScopeRootOrganization: {
      active: true,
      code: references.hrSecondScopeRootOrganizationCode,
    },
    hrResponsibilityTargetOrganization: {
      active: true,
      code: references.hrResponsibilityTargetOrganizationCode,
    },
    position: { active: true, code: references.positionCode },
    globalPosition: { active: true, code: references.globalPositionCode },
    outsideResponsibilityHolderPosition: {
      active: true,
      code: references.outsideResponsibilityHolderPositionCode,
    },
    employment: { active: true },
    responsibilityHolderEmployment: { active: true },
    outsideResponsibilityHolderEmployment: {
      active: true,
      id: references.outsideResponsibilityHolderEmploymentId,
    },
    role: {
      active: true,
      assigned: true,
      code: references.adminRoleCode,
    },
    hrRole: {
      active: true,
      assigned: true,
      code: references.hrAdminRoleCode,
    },
    hrRoleBearingEmployment: { active: true },
    hrSecondScopeRoleBearingEmployment: { active: true },
    hrOrdinaryEmployment: { active: true },
    adminHasMixedRole: true,
    noScopeHrRoleIsIneffective: true,
    hiddenResponsibilityAssignment: {
      active: true,
      id: references.hiddenResponsibilityAssignmentId,
      holderEmploymentId: references.outsideResponsibilityHolderEmploymentId,
      targetOrganizationCode: references.hrResponsibilityTargetOrganizationCode,
    },
    hrSubjectAccess: "enabled" as const,
    hrSubjectFacts: {
      ready: true,
      subjectIdentifier: references.hrAdminSubjectIdentifier,
      sourceDirtyVersion: "1",
      profileUsername: references.hrAdminUsername,
      organizationCodes: [
        references.responsibilityHolderOrganizationCode,
        references.responsibilityTargetOrganizationCode,
        references.hrSecondScopeRootOrganizationCode,
      ],
      positionCodes: [
        references.positionCode,
        references.outsideResponsibilityHolderPositionCode,
      ],
      clientCodes: [references.adminClientCode],
      roleCodes: [references.hrAdminRoleCode],
    },
    hrSubjectProfileReady: true,
    hrSubjectProfileVersion: "1",
    hrSubjectProfileSchemaVersion: 3,
    subjectAccess: "enabled" as const,
    subjectFacts: {
      ready: true,
      subjectIdentifier: references.adminSubjectIdentifier,
      sourceDirtyVersion: "1",
      profileUsername: references.adminUsername,
      organizationCodes: [
        references.organizationCode,
        references.responsibilityHolderOrganizationCode,
      ],
      positionCodes: [
        references.positionCode,
        "e2e-resp-pos-123000000-a1b2c3d4",
      ],
      clientCodes: [references.adminClientCode],
      roleCodes: [references.adminRoleCode, references.hrAdminRoleCode],
      responsibilityTypeCodes: [],
      responsibilityTargetOrganizationCodes: [],
    },
    subjectProfileReady: true,
    subjectProfileVersion: "1",
    subjectProfileSchemaVersion: 3,
  };
}

function generatedReferences() {
  return {
    adminMixedRoleAssignmentId: 45,
    hiddenResponsibilityAssignmentId: 41,
    hrSecondScopeRoleAssignmentId: 42,
    outsideResponsibilityHolderEmploymentId: 43,
    responsibilityHolderEmploymentId: 44,
  };
}
