import type {
  CapturedCommandRunner,
} from "./docker-infra.ts";
import type { RunDescriptor } from "./lifecycle.ts";
import type { PlaywrightJourneyRuntimeOptions } from "./playwright-journey.ts";
import { join } from "node:path";
import { SystemLogEvent } from "@iam/api-core/logger";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import {
  composeArguments,
  descriptorEnvironment,
} from "./docker-infra.ts";
import { createPlaywrightJourneyOperations } from "./playwright-journey.ts";
import { createE2EScenarioIdentity } from "./seed.ts";

interface HrAdminOutcomeReceipt {
  version: 1;
  stage: "hr-admin-outcome";
  status: "failed" | "passed";
  project: string;
  failureCategory?: string;
}

export interface CreateHrAdminJourneyOperationsOptions
  extends PlaywrightJourneyRuntimeOptions {
  captureCommand: CapturedCommandRunner;
  composeFile: string;
  writeOutcomeReceipt?: (
    descriptor: RunDescriptor,
    receipt: HrAdminOutcomeReceipt,
  ) => Promise<unknown>;
}

export function createHrAdminJourneyOperations(
  options: CreateHrAdminJourneyOperationsOptions,
) {
  const playwright = createPlaywrightJourneyOperations({
    ...options,
    specPath: "hr-admin-user-management.spec.ts",
    environment: (_descriptor, scenario) => ({
      IAM_E2E_ADMIN_CLIENT_CODE: scenario.adminClientCode,
      IAM_E2E_HR_ADMIN_UPDATED_NAME: scenario.hrAdminUpdatedName,
      IAM_E2E_HR_ADMIN_USERNAME: scenario.hrAdminUsername,
      IAM_E2E_GLOBAL_POSITION_CODE: scenario.globalPositionCode,
      IAM_E2E_IN_SCOPE_ORGANIZATION_CODE:
        scenario.responsibilityHolderOrganizationCode,
      IAM_E2E_JOURNEY: "hr-admin",
      IAM_E2E_OUTSIDE_ORGANIZATION_CODE:
        scenario.responsibilityTargetOrganizationCode,
      IAM_E2E_SCOPE_ROOT_ORGANIZATION_CODE: scenario.organizationCode,
    }),
  });
  const writeOutcomeReceipt = options.writeOutcomeReceipt
    ?? persistHrAdminOutcomeReceipt;

  return {
    preflight: playwright.preflight,

    async runJourney(descriptor: RunDescriptor, signal?: AbortSignal) {
      await playwright.runJourney(descriptor, signal);
      try {
        await options.runCommand(
          "docker",
          composeArguments(options.composeFile, descriptor.project, [
            "run",
            "--rm",
            "--no-deps",
            "seed",
            "bun",
            "run",
            "src/hr-admin-outcome-cli.ts",
          ]),
          {
            cwd: options.repositoryRoot,
            env: descriptorEnvironment(descriptor),
            signal,
          },
        );
        const logs = await options.captureCommand(
          "docker",
          composeArguments(options.composeFile, descriptor.project, [
            "logs",
            "--no-color",
            "--no-log-prefix",
            "admin-api",
          ]),
          {
            capture: { maxBytes: 512 * 1024, mode: "line-tail" },
            cwd: options.repositoryRoot,
            env: descriptorEnvironment(descriptor),
            signal,
          },
        );
        assertHrAdminDenialLog(
          `${logs.stdout}\n${logs.stderr}`,
          createE2EScenarioIdentity(descriptor.runId),
        );
        await writeOutcomeReceipt(descriptor, {
          version: 1,
          stage: "hr-admin-outcome",
          status: "passed",
          project: descriptor.project,
        });
      }
      catch (error) {
        await writeOutcomeReceipt(descriptor, {
          version: 1,
          stage: "hr-admin-outcome",
          status: "failed",
          project: descriptor.project,
          failureCategory: error instanceof Error ? error.name : "UnknownError",
        });
        throw error;
      }
    },
  };
}

export function assertHrAdminDenialLog(
  rawLogs: string,
  scenario: ReturnType<typeof createE2EScenarioIdentity>,
) {
  const denial = rawLogs.split(/\r?\n/u)
    .map(line => parseJsonObject(line))
    .find(entry => entry?.event === SystemLogEvent.AdminAuthorizationDenied
      && isObject(entry.actor)
      && entry.actor.username === scenario.hrAdminUsername
      && entry.action === "admin.organization.update"
      && entry.resourceType === "organization"
      && entry.resourceIdentifier
      === scenario.responsibilityTargetOrganizationCode
      && entry.reasonCode === "RESOURCE_OUT_OF_SCOPE");
  if (denial === undefined)
    throw new Error("HR Admin denial security log was not observed");
  if (containsForbiddenScopeKey(denial)) {
    throw new Error("HR Admin denial security log leaked authorization scope");
  }
}

function containsForbiddenScopeKey(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some(containsForbiddenScopeKey);
  if (!isObject(value))
    return false;
  return Object.entries(value).some(([key, nested]) =>
    /^(?:scope|organizationIds|rootOrganizationIds)$/iu.test(key)
    || containsForbiddenScopeKey(nested));
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : undefined;
  }
  catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function persistHrAdminOutcomeReceipt(
  descriptor: RunDescriptor,
  receipt: HrAdminOutcomeReceipt,
) {
  await writeAtomicJsonFile(
    join(descriptor.artifactDirectory, "hr-admin-outcome-receipt.json"),
    receipt,
  );
}
