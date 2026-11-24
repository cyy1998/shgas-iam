import { setTimeout } from "node:timers/promises";
import type { OrganizationResponsibilityAssignmentStatus, OrganizationResponsibilityTypeCode } from "@iam/contracts";
import {
  OrganizationResponsibilityAssignmentStatus as AssignmentStatus,
  OrganizationResponsibilityTypeCode as ResponsibilityTypeCode,
  UserDocumentRebuildReason,
  UserDocumentWorkStatus,
} from "@iam/contracts";

import { SystemLogEvent } from "@iam/runtime/logger";
import { containsScalarValue } from "./concealment.ts";
import type { E2EScenarioGeneratedReferences } from "./seed.ts";

export const HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS = [
  "admin.organization_responsibility_assignment.create",
  "admin.organization_responsibility_assignment.pause",
  "admin.organization_responsibility_assignment.resume",
  "admin.organization_responsibility_assignment.end",
  "admin.organization_responsibility_assignment.end",
  "admin.organization_responsibility_assignment.end",
] as const;

export interface HrAdminOutcomeReadBack {
  assignment: {
    id: number;
    status: OrganizationResponsibilityAssignmentStatus;
    ended: boolean;
    typeCode: OrganizationResponsibilityTypeCode;
    actorVisibleTargetCode: string;
    holderPositionCode: string;
  } | null;
  assignmentAudits: Array<{
    action: string;
    actorUsername: string | null;
    outcome: string;
  }>;
  rebuildState: {
    version: string;
    reasonCodes: UserDocumentRebuildReason[];
    status: UserDocumentWorkStatus;
  } | null;
  document: {
    sourceVersion: string;
    containsEndedTargetResponsibility: boolean;
  } | null;
  hiddenBlocker: {
    count: number;
    status: OrganizationResponsibilityAssignmentStatus | null;
  };
  deniedCombinationAssignments: number;
  deniedAssignmentAudits: number;
  adminMixedRoleAssignmentExists: boolean;
  secondScopeRoleAssignmentExists: boolean;
}

export interface HrAdminOutcomeScenario {
  runId: string;
  adminUsername: string;
  hrAdminUsername: string;
  hrAdminRoleCode: string;
  responsibilityHolderPositionCode: string;
  outsideResponsibilityHolderPositionCode: string;
  responsibilityTargetOrganizationCode: string;
  hrSecondScopeRootOrganizationCode: string;
  hrResponsibilityTargetOrganizationCode: string;
}

export interface HrAdminOutcomeOwner {
  readBack: (scenario: HrAdminOutcomeScenario) => Promise<HrAdminOutcomeReadBack>;
}

export async function verifyHrAdminOutcome(input: {
  owner: HrAdminOutcomeOwner;
  scenario: HrAdminOutcomeScenario;
  sleep?: (milliseconds: number) => Promise<unknown>;
  timeoutMs?: number;
}) {
  const sleep = input.sleep ?? setTimeout;
  const deadline = Date.now() + (input.timeoutMs ?? 30_000);
  do {
    const readBack = await input.owner.readBack(input.scenario);
    if (matchesExpectedOutcome(readBack, input.scenario)) {
      return {
        status: "passed" as const,
        assignmentId: readBack.assignment?.id ?? 0,
        version: readBack.rebuildState?.version ?? "",
      };
    }
    await sleep(250);
  } while (Date.now() < deadline);
  throw new Error(
    "HR Admin journey outcome did not confirm responsibility, audit, invalidation, revocation, and denial facts",
  );
}

function matchesExpectedOutcome(actual: HrAdminOutcomeReadBack, expected: HrAdminOutcomeScenario) {
  return (
    actual.assignment !== null &&
    actual.assignment.status === AssignmentStatus.Disable &&
    actual.assignment.ended &&
    actual.assignment.typeCode === ResponsibilityTypeCode.Supervising &&
    actual.assignment.actorVisibleTargetCode === expected.hrResponsibilityTargetOrganizationCode &&
    actual.assignment.holderPositionCode === expected.responsibilityHolderPositionCode &&
    actual.assignmentAudits.length === HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS.length &&
    actual.assignmentAudits.every(
      (audit, index) =>
        audit.action === HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS[index] &&
        audit.actorUsername === expected.hrAdminUsername &&
        audit.outcome === "success",
    ) &&
    actual.rebuildState !== null &&
    BigInt(actual.rebuildState.version) > 1n &&
    actual.rebuildState.status === UserDocumentWorkStatus.Processed &&
    actual.rebuildState.reasonCodes.length === 1 &&
    actual.rebuildState.reasonCodes[0] === UserDocumentRebuildReason.OrganizationResponsibilityAssignmentUpdated &&
    actual.document !== null &&
    actual.document.sourceVersion === actual.rebuildState.version &&
    !actual.document.containsEndedTargetResponsibility &&
    actual.hiddenBlocker.count === 1 &&
    actual.hiddenBlocker.status === AssignmentStatus.Enable &&
    actual.deniedCombinationAssignments === 0 &&
    actual.deniedAssignmentAudits === 0 &&
    !actual.adminMixedRoleAssignmentExists &&
    !actual.secondScopeRoleAssignmentExists
  );
}

export function assertHrAdminDenialLog(
  rawLogs: string,
  scenario: HrAdminOutcomeScenario,
  references: E2EScenarioGeneratedReferences,
) {
  const denials = rawLogs
    .split(/\r?\n/u)
    .map((line) => parseJsonObject(line))
    .filter(
      (entry): entry is Record<string, unknown> =>
        entry?.event === SystemLogEvent.AdminAuthorizationDenied &&
        isObject(entry.actor) &&
        entry.actor.username === scenario.hrAdminUsername,
    );
  const expectedDenial = denials.find(
    (entry) =>
      entry?.action === "admin.organizationResponsibility.createAssignment" &&
      entry.resourceType === "organizationResponsibilityAssignment" &&
      entry.resourceIdentifier === "create-request" &&
      entry.reasonCode === "RESOURCE_OUT_OF_SCOPE",
  );
  if (expectedDenial === undefined) throw new Error("HR Admin denial security log was not observed");
  for (const denial of denials) {
    if (containsForbiddenScopeKey(denial)) {
      throw new Error("HR Admin denial security log leaked authorization scope");
    }
    if (concealedFixtureValues(scenario).some((value) => containsScalarValue(denial, value))) {
      throw new Error("HR Admin denial security log leaked concealed fixture value");
    }
    if (
      denial.resourceIdentifier === references.hiddenResponsibilityAssignmentId ||
      denial.resourceIdentifier === references.outsideResponsibilityHolderEmploymentId
    ) {
      throw new Error("HR Admin denial security log leaked concealed fixture value");
    }
  }
}

function concealedFixtureValues(scenario: HrAdminOutcomeScenario) {
  return [scenario.outsideResponsibilityHolderPositionCode, scenario.responsibilityTargetOrganizationCode];
}

function containsForbiddenScopeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenScopeKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      /^(?:scope|organizationIds|rootOrganizationIds|assignmentId|employmentId|holder|holderOrganizationId|targetOrganizationId|organizationPath)$/iu.test(
        key,
      ) || containsForbiddenScopeKey(nested),
  );
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
