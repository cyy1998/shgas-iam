import type { RunDescriptor } from "./lifecycle.ts";
import { describe, expect, test } from "bun:test";
import {
  assertHrAdminDenialLog,
  createHrAdminJourneyOperations,
} from "./hr-admin-journey.ts";
import { playwrightStagingDirectory } from "./playwright-evidence.ts";
import { createE2EScenarioIdentity } from "./seed.ts";

const descriptor: RunDescriptor = {
  version: 1,
  runId: "hr-admin-journey-01",
  project: "iam-e2e-hr-admin-journey-01",
  gatewayPort: 43123,
  origin: "http://127.0.0.1:43123",
  artifactDirectory: "C:/tmp/iam-e2e/hr-admin-journey-01",
  labels: {
    "com.docker.compose.project": "iam-e2e-hr-admin-journey-01",
    "com.shgas-iam.e2e.run-id": "hr-admin-journey-01",
  },
};

describe("HR Admin User Management journey operations", () => {
  test("runs the real browser journey and verifies PostgreSQL plus the denial log before cleanup", async () => {
    const calls: Array<{
      command: string;
      args: string[];
      env?: NodeJS.ProcessEnv;
    }> = [];
    const captured: Array<{ command: string; args: string[] }> = [];
    const receipts: unknown[] = [];
    const operations = createHrAdminJourneyOperations({
      repositoryRoot: "D:/repo",
      workspaceRoot: "D:/repo/e2e/system",
      composeFile: "D:/repo/e2e/system/compose.yaml",
      accessPath: async () => undefined,
      readScenarioReferences: async () => ({
        adminMixedRoleAssignmentId: 40,
        hiddenResponsibilityAssignmentId: 41,
        hrSecondScopeRoleAssignmentId: 42,
        outsideResponsibilityHolderEmploymentId: 43,
        responsibilityHolderEmploymentId: 44,
      }),
      playwrightCliPath: "D:/repo/e2e/system/node_modules/playwright/cli.js",
      runCommand: async (command, args, options) => {
        calls.push({ command, args, env: options.env });
      },
      captureCommand: async (command, args) => {
        captured.push({ command, args });
        return {
          stdout: `${JSON.stringify({
            event: "admin.authorization.denied",
            actor: {
              username: "e2e-hr-admin-r-admin-journey-01",
            },
            action: "admin.organizationResponsibility.createAssignment",
            resourceType: "organizationResponsibilityAssignment",
            resourceIdentifier: "create-request",
            reasonCode: "RESOURCE_OUT_OF_SCOPE",
          })}\n`,
          stderr: "",
        };
      },
      writeOutcomeReceipt: async (_descriptor, receipt) => {
        receipts.push(receipt);
      },
    });

    await operations.preflight();
    await operations.runJourney(descriptor);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      command: "node",
      args: ["src/playwright-browser-preflight.ts"],
    });
    expect(calls[1]).toMatchObject({
      command: "node",
      args: expect.arrayContaining(["test", "--project", "chromium"]),
      env: {
        IAM_E2E_ADMIN_CLIENT_CODE: "iam-admin",
        IAM_E2E_ADMIN_PASSWORD: expect.any(String),
        IAM_E2E_ADMIN_USERNAME: "e2e-admin-r-admin-journey-01",
        IAM_E2E_ADMIN_MIXED_ROLE_ASSIGNMENT_ID: "40",
        IAM_E2E_DELEGATEE_USERNAME:
          "e2e-delegatee-r-admin-journey-01",
        IAM_E2E_HIDDEN_RESPONSIBILITY_ASSIGNMENT_ID: "41",
        IAM_E2E_HR_ADMIN_UPDATED_NAME:
          "E2E HR Admin Updated r-admin-journey-01",
        IAM_E2E_HR_ADMIN_USERNAME:
          "e2e-hr-admin-r-admin-journey-01",
        IAM_E2E_HR_RESPONSIBILITY_TARGET_ORGANIZATION_CODE:
          "e2e-hr-target-r-admin-journey-01",
        IAM_E2E_HR_SECOND_SCOPE_ROLE_ASSIGNMENT_ID: "42",
        IAM_E2E_HR_SECOND_SCOPE_ROOT_ORGANIZATION_CODE:
          "e2e-hr-root-r-admin-journey-01",
        IAM_E2E_GLOBAL_POSITION_CODE:
          "e2e-global-pos-r-admin-journey-01",
        IAM_E2E_JOURNEY: "hr-admin",
        IAM_E2E_NO_SCOPE_HR_ADMIN_USERNAME:
          "e2e-no-scope-hr-r-admin-journey-01",
        IAM_E2E_ORIGIN: descriptor.origin,
        IAM_E2E_OUTSIDE_RESPONSIBILITY_HOLDER_EMPLOYMENT_ID: "43",
        IAM_E2E_OUTSIDE_RESPONSIBILITY_HOLDER_POSITION_CODE:
          "e2e-outside-resp-pos-r-admin-journey-01",
        IAM_E2E_OUTSIDE_ORGANIZATION_CODE:
          "e2e-resp-target-r-admin-journey-01",
        IAM_E2E_PLAYWRIGHT_OUTPUT_DIR:
          playwrightStagingDirectory(descriptor),
        IAM_E2E_RESPONSIBILITY_HOLDER_EMPLOYMENT_ID: "44",
        IAM_E2E_RESPONSIBILITY_HOLDER_POSITION_CODE:
          "e2e-resp-pos-r-admin-journey-01",
      },
    });
    expect(calls[2]).toMatchObject({
      command: "docker",
      args: [
        "compose",
        "--file",
        "D:/repo/e2e/system/compose.yaml",
        "--project-name",
        descriptor.project,
        "run",
        "--rm",
        "--no-deps",
        "seed",
        "bun",
        "run",
        "src/hr-admin-outcome-cli.ts",
      ],
    });
    expect(captured).toEqual([{
      command: "docker",
      args: [
        "compose",
        "--file",
        "D:/repo/e2e/system/compose.yaml",
        "--project-name",
        descriptor.project,
        "logs",
        "--no-color",
        "--no-log-prefix",
        "admin-api",
      ],
    }]);
    expect(receipts).toEqual([{
      version: 1,
      stage: "hr-admin-outcome",
      status: "passed",
      project: descriptor.project,
    }]);
  });

  test("rejects scope keys and hidden fixture values in every HR denial log", () => {
    const scenario = createE2EScenarioIdentity(descriptor.runId);
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

    expect(() => assertHrAdminDenialLog([
      JSON.stringify(safeDenial),
      JSON.stringify({ ...safeDenial, scope: [1] }),
    ].join("\n"), scenario, references)).toThrow(
      "leaked authorization scope",
    );
    expect(() => assertHrAdminDenialLog([
      JSON.stringify(safeDenial),
      JSON.stringify({
        ...safeDenial,
        detail: scenario.outsideResponsibilityHolderPositionCode,
      }),
    ].join("\n"), scenario, references)).toThrow(
      "leaked concealed fixture value",
    );
    expect(() => assertHrAdminDenialLog([
      JSON.stringify(safeDenial),
      JSON.stringify({
        ...safeDenial,
        resourceIdentifier: references.hiddenResponsibilityAssignmentId,
      }),
    ].join("\n"), scenario, references)).toThrow(
      "leaked concealed fixture value",
    );
  });
});
