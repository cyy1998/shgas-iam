import type { HrAdminOutcomeScenario } from "./hr-admin-outcome.ts";
import {
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { verifyHrAdminOutcome } from "./hr-admin-outcome.ts";

const scenario = {
  runId: "outcome-01",
  hrAdminUsername: "e2e-hr-admin-outcome-01",
  hrAdminUpdatedName: "E2E HR Admin Updated outcome-01",
  responsibilityTargetOrganizationCode: "e2e-resp-target-outcome-01",
} satisfies HrAdminOutcomeScenario;

describe("HR Admin journey outcome", () => {
  test("accepts the committed User, audit, publication, and denied no-write facts", async () => {
    const result = await verifyHrAdminOutcome({
      scenario,
      owner: {
        readBack: async () => completeReadBack(),
      },
    });

    expect(result).toEqual({
      status: "passed",
      dirtyVersion: "2",
    });
  });

  test("waits for the production Worker to publish the invalidated User Profile", async () => {
    const observations = [
      {
        ...completeReadBack(),
        profile: {
          name: "E2E HR Admin outcome-01",
          sourceDirtyVersion: "1",
        },
        dirty: {
          dirtyVersion: "2",
          reasonCodes: [UserProfileDirtyReason.UserUpdated],
          status: UserProfileDirtyStatus.Pending,
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

  test("rejects any business audit for the concealed out-of-scope mutation", async () => {
    let rejection: unknown;
    try {
      await verifyHrAdminOutcome({
        scenario,
        owner: {
          readBack: async () => ({
            ...completeReadBack(),
            outsideOrganizationAudits: [{
              action: "admin.organization.update",
              outcome: "failed",
            }],
          }),
        },
        sleep: async () => undefined,
        timeoutMs: 0,
      });
    }
    catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);
  });
});

function completeReadBack() {
  return {
    user: { name: scenario.hrAdminUpdatedName },
    successfulUserAudits: [{
      action: "admin.user.update",
      actorUsername: scenario.hrAdminUsername,
      outcome: "success",
      targetCode: scenario.hrAdminUsername,
    }],
    dirty: {
      dirtyVersion: "2",
      reasonCodes: [UserProfileDirtyReason.UserUpdated],
      status: UserProfileDirtyStatus.Processed,
    },
    profile: {
      name: scenario.hrAdminUpdatedName,
      sourceDirtyVersion: "2",
    },
    outsideOrganization: {
      name: `E2E Responsibility Target ${scenario.runId}`,
    },
    outsideOrganizationAudits: [],
  };
}
