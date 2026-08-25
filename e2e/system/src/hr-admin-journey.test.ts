import type { RunDescriptor } from "./lifecycle.ts";
import { describe, expect, test } from "bun:test";
import { createHrAdminJourneyOperations } from "./hr-admin-journey.ts";
import { playwrightStagingDirectory } from "./playwright-evidence.ts";

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
            action: "admin.organization.update",
            resourceType: "organization",
            resourceIdentifier: "e2e-resp-target-r-admin-journey-01",
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
        IAM_E2E_HR_ADMIN_UPDATED_NAME:
          "E2E HR Admin Updated r-admin-journey-01",
        IAM_E2E_HR_ADMIN_USERNAME:
          "e2e-hr-admin-r-admin-journey-01",
        IAM_E2E_GLOBAL_POSITION_CODE:
          "e2e-global-pos-r-admin-journey-01",
        IAM_E2E_JOURNEY: "hr-admin",
        IAM_E2E_ORIGIN: descriptor.origin,
        IAM_E2E_OUTSIDE_ORGANIZATION_CODE:
          "e2e-resp-target-r-admin-journey-01",
        IAM_E2E_PLAYWRIGHT_OUTPUT_DIR:
          playwrightStagingDirectory(descriptor),
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
});
