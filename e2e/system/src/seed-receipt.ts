import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import type { E2EScenarioGeneratedReferences, E2EScenarioReferences } from "./seed.ts";
import { createE2EScenarioIdentity } from "./seed.ts";

interface SeedReceiptBase {
  version: 1;
  stage: "seed";
}

export type SeedReceipt =
  | (SeedReceiptBase & {
      attemptedAt: string;
      status: "attempted";
    })
  | (SeedReceiptBase & {
      attemptedAt: string;
      completedAt: string;
      failureCategory: string;
      status: "failed";
    })
  | (SeedReceiptBase & {
      completedAt: string;
      scenario: E2EScenarioReferences;
      status: "applied";
    });

export async function persistSeedReceipt(path: string, receipt: SeedReceipt) {
  await mkdir(dirname(path), { recursive: true });
  await writeAtomicJsonFile(path, receipt);
}

function readGeneratedReferences(
  scenario: Record<string, unknown>,
  errorMessage: string,
): E2EScenarioGeneratedReferences {
  const references = {
    adminMixedRoleAssignmentId: scenario.adminMixedRoleAssignmentId,
    hiddenResponsibilityAssignmentId: scenario.hiddenResponsibilityAssignmentId,
    hrSecondScopeRoleAssignmentId: scenario.hrSecondScopeRoleAssignmentId,
    outsideResponsibilityHolderEmploymentId: scenario.outsideResponsibilityHolderEmploymentId,
    responsibilityHolderEmploymentId: scenario.responsibilityHolderEmploymentId,
  };
  if (!Object.values(references).every((value) => Number.isSafeInteger(value) && Number(value) > 0)) {
    throw new Error(errorMessage);
  }
  return references as E2EScenarioGeneratedReferences;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The template receipt carries the full seed identity across commands and worktrees.
export function readTemplateSeedReceipt(
  contents: string,
  expected: { runId: string; canonicalOrigin: string; internalOrigin: string },
): E2EScenarioReferences {
  const scenario = readAppliedScenario(contents, "E2E template requires an applied seed receipt");
  if (
    scenario.version !== 1 ||
    scenario.runId !== expected.runId ||
    scenario.canonicalOrigin !== expected.canonicalOrigin ||
    scenario.internalOrigin !== expected.internalOrigin
  ) {
    throw new Error("E2E template receipt does not match its seed identity or callback origins");
  }
  const expectedFields = {
    ...createE2EScenarioIdentity(expected.runId),
    adminRedirectUri: `${expected.canonicalOrigin}/iam-admin/*`,
    customSsoRedirectUri: `${expected.canonicalOrigin}/e2e/custom-sso/*`,
    oidcRedirectUri: `${expected.canonicalOrigin}/e2e/oidc/callback`,
    oidcPostLogoutRedirectUri: `${expected.canonicalOrigin}/e2e/oidc/logged-out`,
  };
  if (
    Object.entries(expectedFields).some(([key, value]) => scenario[key] !== value) ||
    [
      "adminSubjectIdentifier",
      "hrAdminSubjectIdentifier",
      "delegateeSubjectIdentifier",
      "pausedSubjectIdentifier",
      "disabledSubjectIdentifier",
      "noScopeHrAdminSubjectIdentifier",
      "smsBindingSubjectIdentifier",
    ].some(
      (key) =>
        typeof scenario[key] !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(scenario[key]),
    )
  ) {
    throw new Error("E2E template receipt has invalid scenario references");
  }
  readGeneratedReferences(scenario, "E2E template receipt has invalid generated references");
  return scenario as unknown as E2EScenarioReferences;
}

function readAppliedScenario(contents: string, errorMessage: string) {
  const receipt: unknown = JSON.parse(contents);
  if (
    !isObject(receipt) ||
    receipt.version !== 1 ||
    receipt.stage !== "seed" ||
    receipt.status !== "applied" ||
    typeof receipt.completedAt !== "string" ||
    Number.isNaN(Date.parse(receipt.completedAt)) ||
    !isObject(receipt.scenario)
  ) {
    throw new Error(errorMessage);
  }
  return receipt.scenario;
}
