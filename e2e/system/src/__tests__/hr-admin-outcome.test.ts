import { describe, expect, test } from "bun:test";
import {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  UserDocumentRebuildReason,
  UserDocumentWorkStatus,
} from "@iam/contracts";
import type { HrAdminOutcomeScenario } from "../hr-admin-outcome.ts";
import { assertHrAdminDenialLog, verifyHrAdminOutcome } from "../hr-admin-outcome.ts";

const scenario = {
  runId: "outcome-01",
  adminUsername: "e2e-admin-outcome-01",
  hrAdminUsername: "e2e-hr-admin-outcome-01",
  hrAdminRoleCode: "iam:hr-admin",
  responsibilityHolderPositionCode: "e2e-resp-pos-outcome-01",
  outsideResponsibilityHolderPositionCode: "e2e-outside-resp-pos-outcome-01",
  responsibilityTargetOrganizationCode: "e2e-resp-target-outcome-01",
  hrSecondScopeRootOrganizationCode: "e2e-hr-root-outcome-01",
  hrResponsibilityTargetOrganizationCode: "e2e-hr-target-outcome-01",
} satisfies HrAdminOutcomeScenario;

describe("HR Admin responsibility journey outcome", () => {
  test("accepts lifecycle audit, publication convergence, scope revocation, and denied no-write facts", async () => {
    const result = await verifyHrAdminOutcome({
      scenario,
      owner: { readBack: async () => completeReadBack() },
    });

    expect(result).toEqual({
      status: "passed",
      assignmentId: 51,
      version: "6",
    });
  });

  test("waits for the production Worker to publish the final ended state", async () => {
    const observations = [
      {
        ...completeReadBack(),
        rebuildState: {
          version: "6",
          reasonCodes: [UserDocumentRebuildReason.OrganizationResponsibilityAssignmentUpdated],
          status: UserDocumentWorkStatus.Pending,
        },
        document: {
          sourceVersion: "5",
          containsEndedTargetResponsibility: true,
        },
      },
      completeReadBack(),
    ];
    let reads = 0;
    const result = await verifyHrAdminOutcome({
      scenario,
      owner: {
        readBack: async () => observations[reads++] ?? completeReadBack(),
      },
      sleep: async () => undefined,
    });

    expect(result.status).toBe("passed");
    expect(reads).toBe(2);
  });

  test("rejects any Assignment or audit written by a concealed denial", async () => {
    let rejection: unknown;
    try {
      await verifyHrAdminOutcome({
        scenario,
        owner: {
          readBack: async () => ({
            ...completeReadBack(),
            deniedCombinationAssignments: 1,
          }),
        },
        sleep: async () => undefined,
        timeoutMs: 0,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);
  });

  test("rejects scope keys and hidden fixture values in every HR denial log", () => {
    const references = {
      adminMixedRoleAssignmentId: 40,
      hiddenResponsibilityAssignmentId: 41,
      hrSecondScopeRoleAssignmentId: 42,
      outsideResponsibilityHolderEmploymentId: 43,
      responsibilityHolderEmploymentId: 44,
    };
    const safeDenial = {
      event: "admin.authorization.denied",
      actor: { username: scenario.hrAdminUsername },
      action: "admin.organizationResponsibility.createAssignment",
      resourceType: "organizationResponsibilityAssignment",
      resourceIdentifier: "create-request",
      reasonCode: "RESOURCE_OUT_OF_SCOPE",
    };

    expect(() => assertHrAdminDenialLog(JSON.stringify(safeDenial), scenario, references)).not.toThrow();
    expect(() =>
      assertHrAdminDenialLog(
        [JSON.stringify(safeDenial), JSON.stringify({ ...safeDenial, scope: [1] })].join("\n"),
        scenario,
        references,
      ),
    ).toThrow("leaked authorization scope");
    expect(() =>
      assertHrAdminDenialLog(
        [
          JSON.stringify(safeDenial),
          JSON.stringify({
            ...safeDenial,
            detail: scenario.outsideResponsibilityHolderPositionCode,
          }),
        ].join("\n"),
        scenario,
        references,
      ),
    ).toThrow("leaked concealed fixture value");
    expect(() =>
      assertHrAdminDenialLog(
        [
          JSON.stringify(safeDenial),
          JSON.stringify({
            ...safeDenial,
            resourceIdentifier: references.hiddenResponsibilityAssignmentId,
          }),
        ].join("\n"),
        scenario,
        references,
      ),
    ).toThrow("leaked concealed fixture value");
  });
});

function completeReadBack() {
  return {
    assignment: {
      id: 51,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
      ended: true,
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      actorVisibleTargetCode: scenario.hrResponsibilityTargetOrganizationCode,
      holderPositionCode: scenario.responsibilityHolderPositionCode,
    },
    assignmentAudits: [
      "admin.organization_responsibility_assignment.create",
      "admin.organization_responsibility_assignment.pause",
      "admin.organization_responsibility_assignment.resume",
      "admin.organization_responsibility_assignment.end",
      "admin.organization_responsibility_assignment.end",
      "admin.organization_responsibility_assignment.end",
    ].map((action) => ({
      action,
      actorUsername: scenario.hrAdminUsername,
      outcome: "success",
    })),
    rebuildState: {
      version: "6",
      reasonCodes: [UserDocumentRebuildReason.OrganizationResponsibilityAssignmentUpdated],
      status: UserDocumentWorkStatus.Processed,
    },
    document: {
      sourceVersion: "6",
      containsEndedTargetResponsibility: false,
    },
    hiddenBlocker: {
      count: 1,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
    },
    deniedCombinationAssignments: 0,
    deniedAssignmentAudits: 0,
    adminMixedRoleAssignmentExists: false,
    secondScopeRoleAssignmentExists: false,
  };
}
