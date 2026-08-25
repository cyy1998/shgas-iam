import type {
  CapturedCommandRunner,
} from "./docker-infra.ts";
import type { RunDescriptor } from "./lifecycle.ts";
import type { PlaywrightJourneyRuntimeOptions } from "./playwright-journey.ts";
import type { E2EScenarioGeneratedReferences } from "./seed.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SystemLogEvent } from "@iam/api-core/logger";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import { containsScalarValue } from "./concealment.ts";
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
  readScenarioReferences?: (
    descriptor: RunDescriptor,
  ) => Promise<E2EScenarioGeneratedReferences>;
}

export function createHrAdminJourneyOperations(
  options: CreateHrAdminJourneyOperationsOptions,
) {
  const readScenarioReferences = options.readScenarioReferences
    ?? readGeneratedScenarioReferences;
  const playwright = createPlaywrightJourneyOperations({
    ...options,
    specPath: "hr-admin-user-management.spec.ts",
    environment: async (descriptor, scenario) => {
      const generated = await readScenarioReferences(descriptor);
      return {
        IAM_E2E_ADMIN_CLIENT_CODE: scenario.adminClientCode,
        IAM_E2E_ADMIN_MIXED_ROLE_ASSIGNMENT_ID:
        String(generated.adminMixedRoleAssignmentId),
        IAM_E2E_ADMIN_USERNAME: scenario.adminUsername,
        IAM_E2E_DELEGATEE_USERNAME: scenario.delegateeUsername,
        IAM_E2E_HIDDEN_RESPONSIBILITY_ASSIGNMENT_ID:
        String(generated.hiddenResponsibilityAssignmentId),
        IAM_E2E_HR_ADMIN_UPDATED_NAME: scenario.hrAdminUpdatedName,
        IAM_E2E_HR_ADMIN_USERNAME: scenario.hrAdminUsername,
        IAM_E2E_HR_RESPONSIBILITY_TARGET_ORGANIZATION_CODE:
        scenario.hrResponsibilityTargetOrganizationCode,
        IAM_E2E_HR_SECOND_SCOPE_ROLE_ASSIGNMENT_ID:
        String(generated.hrSecondScopeRoleAssignmentId),
        IAM_E2E_HR_SECOND_SCOPE_ROOT_ORGANIZATION_CODE:
        scenario.hrSecondScopeRootOrganizationCode,
        IAM_E2E_GLOBAL_POSITION_CODE: scenario.globalPositionCode,
        IAM_E2E_IN_SCOPE_ORGANIZATION_CODE:
        scenario.responsibilityHolderOrganizationCode,
        IAM_E2E_JOURNEY: "hr-admin",
        IAM_E2E_NO_SCOPE_HR_ADMIN_USERNAME: scenario.noScopeHrAdminUsername,
        IAM_E2E_OUTSIDE_RESPONSIBILITY_HOLDER_EMPLOYMENT_ID:
        String(generated.outsideResponsibilityHolderEmploymentId),
        IAM_E2E_OUTSIDE_RESPONSIBILITY_HOLDER_POSITION_CODE:
        scenario.outsideResponsibilityHolderPositionCode,
        IAM_E2E_OUTSIDE_ORGANIZATION_CODE:
        scenario.responsibilityTargetOrganizationCode,
        IAM_E2E_SCOPE_ROOT_ORGANIZATION_CODE: scenario.organizationCode,
        IAM_E2E_RESPONSIBILITY_HOLDER_EMPLOYMENT_ID:
        String(generated.responsibilityHolderEmploymentId),
        IAM_E2E_RESPONSIBILITY_HOLDER_POSITION_CODE:
        scenario.responsibilityHolderPositionCode,
      };
    },
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
          await readScenarioReferences(descriptor),
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

async function readGeneratedScenarioReferences(
  descriptor: RunDescriptor,
): Promise<E2EScenarioGeneratedReferences> {
  const raw = await readFile(
    join(descriptor.artifactDirectory, "seed-receipt.json"),
    "utf8",
  );
  const receipt: unknown = JSON.parse(raw);
  if (!isObject(receipt) || receipt.status !== "applied"
    || !isObject(receipt.scenario)) {
    throw new Error("HR Admin journey requires an applied seed receipt");
  }
  const scenario = receipt.scenario;
  const references = {
    adminMixedRoleAssignmentId: scenario.adminMixedRoleAssignmentId,
    hiddenResponsibilityAssignmentId:
      scenario.hiddenResponsibilityAssignmentId,
    hrSecondScopeRoleAssignmentId: scenario.hrSecondScopeRoleAssignmentId,
    outsideResponsibilityHolderEmploymentId:
      scenario.outsideResponsibilityHolderEmploymentId,
    responsibilityHolderEmploymentId: scenario.responsibilityHolderEmploymentId,
  };
  if (!Object.values(references).every(
    value => Number.isInteger(value) && Number(value) > 0,
  )) {
    throw new Error("HR Admin seed receipt is missing generated references");
  }
  return references as E2EScenarioGeneratedReferences;
}

export function assertHrAdminDenialLog(
  rawLogs: string,
  scenario: ReturnType<typeof createE2EScenarioIdentity>,
  references: E2EScenarioGeneratedReferences,
) {
  const denials = rawLogs.split(/\r?\n/u)
    .map(line => parseJsonObject(line))
    .filter((entry): entry is Record<string, unknown> =>
      entry?.event === SystemLogEvent.AdminAuthorizationDenied
      && isObject(entry.actor)
      && entry.actor.username === scenario.hrAdminUsername);
  const expectedDenial = denials.find(entry => entry?.action
    === "admin.organizationResponsibility.createAssignment"
    && entry.resourceType === "organizationResponsibilityAssignment"
    && entry.resourceIdentifier === "create-request"
    && entry.reasonCode === "RESOURCE_OUT_OF_SCOPE");
  if (expectedDenial === undefined)
    throw new Error("HR Admin denial security log was not observed");
  for (const denial of denials) {
    if (containsForbiddenScopeKey(denial)) {
      throw new Error("HR Admin denial security log leaked authorization scope");
    }
    if (concealedFixtureValues(scenario).some(value =>
      containsScalarValue(denial, value))) {
      throw new Error("HR Admin denial security log leaked concealed fixture value");
    }
    if (denial.resourceIdentifier
      === references.hiddenResponsibilityAssignmentId
      || denial.resourceIdentifier
      === references.outsideResponsibilityHolderEmploymentId) {
      throw new Error("HR Admin denial security log leaked concealed fixture value");
    }
  }
}

function concealedFixtureValues(
  scenario: ReturnType<typeof createE2EScenarioIdentity>,
) {
  return [
    scenario.outsideResponsibilityHolderPositionCode,
    scenario.responsibilityTargetOrganizationCode,
  ];
}

function containsForbiddenScopeKey(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some(containsForbiddenScopeKey);
  if (!isObject(value))
    return false;
  return Object.entries(value).some(([key, nested]) =>
    /^(?:scope|organizationIds|rootOrganizationIds|assignmentId|employmentId|holder|holderOrganizationId|targetOrganizationId|organizationPath)$/iu
      .test(key)
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
