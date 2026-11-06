import { describe, expect, test } from "bun:test";
import {
  ClientSsoCallbackType,
  ClientSsoProtocol,
  OidcClientType,
  SubjectClaim,
  UserDocumentWorkStatus,
} from "@iam/contracts";
import type { E2EScenarioOwner, E2EScenarioReadBack, E2EScenarioReferences } from "../seed.ts";
import { createE2ESeedSubjects, seedE2EScenario } from "../seed.ts";

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
            sourceVersion: "",
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

    await expect(
      seedE2EScenario({
        adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
        canonicalOrigin: "http://127.0.0.1:43123",
        owner,
        random: scenarioRandom(),
        runId: "20260806123000000-a1b2c3d4",
      }),
    ).rejects.toThrow("E2E scenario owner read-back did not confirm the complete fixed scenario");
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
            sourceVersion: "2",
          },
        };
      },
    };

    await expect(
      seedE2EScenario({
        adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
        canonicalOrigin: "http://127.0.0.1:43123",
        owner,
        random: scenarioRandom(),
        runId: "20260806123000000-a1b2c3d4",
      }),
    ).rejects.toThrow("E2E scenario owner read-back did not confirm the complete fixed scenario");
  });

  test.each([0, 1, 2, 3, 4, 5])("rejects stale Facts for seed user %i", async (index) => {
    await expectSeedReadBackFailure((readBack) => {
      requiredSeedSubject(readBack, index).factsVersion = "2";
    });
  });

  test.each([
    [0, "disabled"],
    [1, "disabled"],
    [2, "disabled"],
    [3, "enabled"],
    [4, "enabled"],
    [5, "disabled"],
  ] as const)("rejects the wrong access state for seed user %i", async (index, state) => {
    await expectSeedReadBackFailure((readBack) => {
      requiredSeedSubject(readBack, index).subjectAccess = state;
    });
  });

  test.each([
    "missing-user",
    "duplicate-user",
    "foreign-user",
    "missing-document",
    "wrong-schema",
    "pending-rebuild",
    "stale-document",
    "missing-facts",
    "wrong-facts-subject",
    "missing-access",
    "invalid-access",
    "blocking-access",
  ] as const)("rejects incomplete seed readiness: %s", async (variant) => {
    await expectSeedReadBackFailure((readBack) => {
      const subject = requiredSeedSubject(readBack, 2);
      switch (variant) {
        case "missing-user":
          readBack.subjects.pop();
          break;
        case "duplicate-user":
          readBack.subjects[5] = { ...subject };
          break;
        case "foreign-user":
          subject.subjectIdentifier = "another-subject";
          break;
        case "missing-document":
          subject.documentVersion = "";
          break;
        case "wrong-schema":
          subject.documentSchemaVersion = 2;
          break;
        case "pending-rebuild":
          subject.rebuildStatus = UserDocumentWorkStatus.Pending;
          break;
        case "stale-document":
          subject.rebuildVersion = "2";
          break;
        case "missing-facts":
          subject.factsVersion = "";
          break;
        case "wrong-facts-subject":
          subject.factsSubjectIdentifier = "another-subject";
          break;
        case "missing-access":
          subject.subjectAccess = "missing";
          break;
        case "invalid-access":
          subject.subjectAccess = "invalid";
          break;
        case "blocking-access":
          subject.subjectAccess = "blocking";
          break;
      }
    });
  });

  test("rejects a gateway-ready iam Client whose portal SSO delivery is disabled", async () => {
    const owner: E2EScenarioOwner = {
      establish: async () => generatedReferences(),
      async readBack(references) {
        const readBack = completeReadBack(references);
        return { ...readBack, gatewayClient: { ...readBack.gatewayClient, ssoEnabled: false } };
      },
    };
    let failure: unknown;
    try {
      await seedE2EScenario({
        adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
        canonicalOrigin: "http://127.0.0.1:43123",
        owner,
        random: scenarioRandom(),
        runId: "20260806123000000-a1b2c3d4",
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: "E2E scenario owner read-back did not confirm the complete fixed scenario",
    });
  });

  test.each(["protocol", "callback", "redirect", "claims"] as const)(
    "rejects an iam Client with an invalid portal %s prerequisite",
    async (variant) => {
      const owner: E2EScenarioOwner = {
        establish: async () => generatedReferences(),
        async readBack(references) {
          const readBack = completeReadBack(references);
          const changes =
            variant === "protocol"
              ? { ssoProtocol: ClientSsoProtocol.Oidc }
              : variant === "callback"
                ? { callbackType: ClientSsoCallbackType.Business }
                : variant === "redirect"
                  ? { redirectUris: [`${references.canonicalOrigin}/other/*`] }
                  : { subjectClaims: [SubjectClaim.SubjectIdentifier] };
          return { ...readBack, gatewayClient: { ...readBack.gatewayClient, ...changes } };
        },
      };
      let failure: unknown;
      try {
        await seedE2EScenario({
          adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
          canonicalOrigin: "http://127.0.0.1:43123",
          owner,
          random: scenarioRandom(),
          runId: "20260806123000000-a1b2c3d4",
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
    },
  );
});

function requiredSeedSubject(readBack: E2EScenarioReadBack, index: number) {
  const subject = readBack.subjects[index];
  if (subject === undefined) throw new Error("Seed test fixture is missing a subject");
  return subject;
}

async function expectSeedReadBackFailure(mutate: (readBack: E2EScenarioReadBack) => void) {
  let failure: unknown;
  try {
    await seedE2EScenario({
      adminPassword: "SYNTHETIC-PASSWORD-ONLY-FOR-E2E",
      canonicalOrigin: "http://127.0.0.1:43123",
      owner: {
        establish: async () => generatedReferences(),
        readBack: async (references) => {
          const readBack = completeReadBack(references);
          mutate(readBack);
          return readBack;
        },
      },
      random: scenarioRandom(),
      runId: "20260806123000000-a1b2c3d4",
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({
    message: "E2E seed read-back did not confirm all six users' documents, facts and access barriers",
  });
}

function completeReadBack(references: E2EScenarioReferences): E2EScenarioReadBack {
  return {
    subjects: createE2ESeedSubjects(references).map(({ subjectIdentifier, state }) => ({
      subjectIdentifier,
      documentSchemaVersion: 1,
      documentVersion: "1",
      rebuildVersion: "1",
      rebuildStatus: UserDocumentWorkStatus.Processed,
      factsSubjectIdentifier: subjectIdentifier,
      factsVersion: "1",
      subjectAccess: state,
    })),
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
      ssoEnabled: true,
      clientCode: references.adminClientCode,
      callbackEndpoint: null,
      redirectUris: [references.adminRedirectUri],
    },
    customSsoClient: {
      active: true,
      ssoEnabled: false,
      clientCode: references.customSsoClientCode,
      callbackEndpoint: null,
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
    gatewayClient: {
      active: true,
      ssoEnabled: true,
      clientCode: "iam",
      credentialMatches: true,
      ssoProtocol: ClientSsoProtocol.CustomSso,
      callbackType: ClientSsoCallbackType.Managed,
      redirectUris: [
        ...new Set([references.canonicalOrigin, references.internalOrigin ?? references.canonicalOrigin]),
      ].map((origin) => `${origin}/portal/*`),
      subjectClaims: [
        SubjectClaim.SubjectIdentifier,
        SubjectClaim.ProfileUsername,
        SubjectClaim.ProfileName,
        SubjectClaim.ProfilePhone,
        SubjectClaim.ProfileEmployments,
      ],
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
      sourceVersion: "1",
      profileUsername: references.hrAdminUsername,
      organizationCodes: [
        references.responsibilityHolderOrganizationCode,
        references.responsibilityTargetOrganizationCode,
        references.hrSecondScopeRootOrganizationCode,
      ],
      positionCodes: [references.positionCode, references.outsideResponsibilityHolderPositionCode],
      clientCodes: [references.adminClientCode],
      roleCodes: [references.hrAdminRoleCode],
    },
    hrSubjectDocumentReady: true,
    hrSubjectDocumentVersion: "1",
    hrSubjectDocumentSchemaVersion: 1,
    subjectAccess: "enabled" as const,
    subjectFacts: {
      ready: true,
      subjectIdentifier: references.adminSubjectIdentifier,
      sourceVersion: "1",
      profileUsername: references.adminUsername,
      organizationCodes: [references.organizationCode, references.responsibilityHolderOrganizationCode],
      positionCodes: [references.positionCode, "e2e-resp-pos-123000000-a1b2c3d4"],
      clientCodes: [references.adminClientCode, references.internalClientCode],
      roleCodes: [references.adminRoleCode, references.hrAdminRoleCode, `${references.adminRoleCode}-internal`],
      responsibilityTypeCodes: [],
      responsibilityTargetOrganizationCodes: [],
    },
    subjectDocumentReady: true,
    subjectDocumentVersion: "1",
    subjectDocumentSchemaVersion: 1,
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

function scenarioRandom() {
  let next = 0;
  return { uuid: () => `3b766c91-1daa-4c09-89e4-ea87ad12345${++next}` };
}
