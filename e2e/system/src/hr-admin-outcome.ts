import type {
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
} from "@iam/contracts";
import {
  UserProfileDirtyReason as UserProfileDirtyReasonValue,
  UserProfileDirtyStatus as UserProfileDirtyStatusValue,
} from "@iam/contracts";

export interface HrAdminOutcomeReadBack {
  user: { name: string } | null;
  successfulUserAudits: Array<{
    action: string;
    actorUsername: string | null;
    outcome: string;
    targetCode: string | null;
  }>;
  dirty: {
    dirtyVersion: string;
    reasonCodes: UserProfileDirtyReason[];
    status: UserProfileDirtyStatus;
  } | null;
  profile: {
    name: string;
    sourceDirtyVersion: string;
  } | null;
  outsideOrganization: { name: string } | null;
  outsideOrganizationAudits: Array<{
    action: string;
    outcome: string;
  }>;
}

export interface HrAdminOutcomeScenario {
  runId: string;
  hrAdminUsername: string;
  hrAdminUpdatedName: string;
  responsibilityTargetOrganizationCode: string;
}

export interface HrAdminOutcomeOwner {
  readBack: (
    scenario: HrAdminOutcomeScenario,
  ) => Promise<HrAdminOutcomeReadBack>;
}

export async function verifyHrAdminOutcome(input: {
  owner: HrAdminOutcomeOwner;
  scenario: HrAdminOutcomeScenario;
  sleep?: (milliseconds: number) => Promise<unknown>;
  timeoutMs?: number;
}) {
  const sleep = input.sleep ?? Bun.sleep;
  const deadline = Date.now() + (input.timeoutMs ?? 30_000);
  do {
    const readBack = await input.owner.readBack(input.scenario);
    if (matchesExpectedOutcome(readBack, input.scenario)) {
      return {
        status: "passed" as const,
        dirtyVersion: readBack.dirty?.dirtyVersion ?? "",
      };
    }
    await sleep(250);
  } while (Date.now() < deadline);
  throw new Error(
    "HR Admin journey outcome did not confirm business, audit, invalidation, and denial facts",
  );
}

function matchesExpectedOutcome(
  actual: HrAdminOutcomeReadBack,
  expected: HrAdminOutcomeScenario,
) {
  const userAudit = actual.successfulUserAudits[0];
  return actual.user?.name === expected.hrAdminUpdatedName
    && actual.successfulUserAudits.length === 1
    && userAudit?.action === "admin.user.update"
    && userAudit.actorUsername === expected.hrAdminUsername
    && userAudit.outcome === "success"
    && userAudit.targetCode === expected.hrAdminUsername
    && actual.dirty !== null
    && BigInt(actual.dirty.dirtyVersion) > 1n
    && actual.dirty.status === UserProfileDirtyStatusValue.Processed
    && actual.dirty.reasonCodes.length === 1
    && actual.dirty.reasonCodes[0] === UserProfileDirtyReasonValue.UserUpdated
    && actual.profile?.name === expected.hrAdminUpdatedName
    && actual.profile.sourceDirtyVersion === actual.dirty.dirtyVersion
    && actual.outsideOrganization?.name
    === `E2E Responsibility Target ${expected.runId}`
    && actual.outsideOrganizationAudits.length === 0;
}
