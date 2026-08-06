import type { E2EScenarioReferences } from "./seed.ts";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";

interface SeedReceiptBase {
  version: 1;
  stage: "seed";
}

export type SeedReceipt
  = | SeedReceiptBase & {
    attemptedAt: string;
    status: "attempted";
  }
  | SeedReceiptBase & {
    attemptedAt: string;
    completedAt: string;
    failureCategory: string;
    status: "failed";
  }
  | SeedReceiptBase & {
    completedAt: string;
    scenario: E2EScenarioReferences;
    status: "applied";
  };

export async function persistSeedReceipt(
  path: string,
  receipt: SeedReceipt,
) {
  await mkdir(dirname(path), { recursive: true });
  await writeAtomicJsonFile(path, receipt);
}
