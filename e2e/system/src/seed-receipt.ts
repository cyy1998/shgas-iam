import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import type { RunDescriptor } from "./lifecycle.ts";
import type { E2EScenarioGeneratedReferences, E2EScenarioReferences } from "./seed.ts";

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

export async function readAppliedSeedReferences(descriptor: RunDescriptor): Promise<E2EScenarioGeneratedReferences> {
  const receipt: unknown = JSON.parse(await readFile(join(descriptor.artifactDirectory, "seed-receipt.json"), "utf8"));
  if (
    !isObject(receipt) ||
    receipt.version !== 1 ||
    receipt.stage !== "seed" ||
    receipt.status !== "applied" ||
    typeof receipt.completedAt !== "string" ||
    Number.isNaN(Date.parse(receipt.completedAt)) ||
    !isObject(receipt.scenario)
  ) {
    throw new Error("HR Admin journey requires an applied seed receipt");
  }
  const scenario = receipt.scenario;
  if (
    scenario.version !== 1 ||
    scenario.runId !== descriptor.runId ||
    scenario.canonicalOrigin !== descriptor.origin ||
    (scenario.internalOrigin ?? scenario.canonicalOrigin) !== (descriptor.internalOrigin ?? descriptor.origin)
  ) {
    throw new Error("seed receipt does not belong to this E2E run");
  }
  const references = {
    adminMixedRoleAssignmentId: scenario.adminMixedRoleAssignmentId,
    hiddenResponsibilityAssignmentId: scenario.hiddenResponsibilityAssignmentId,
    hrSecondScopeRoleAssignmentId: scenario.hrSecondScopeRoleAssignmentId,
    outsideResponsibilityHolderEmploymentId: scenario.outsideResponsibilityHolderEmploymentId,
    responsibilityHolderEmploymentId: scenario.responsibilityHolderEmploymentId,
  };
  if (!Object.values(references).every((value) => Number.isSafeInteger(value) && Number(value) > 0)) {
    throw new Error("HR Admin seed receipt is missing generated references");
  }
  return references as E2EScenarioGeneratedReferences;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
