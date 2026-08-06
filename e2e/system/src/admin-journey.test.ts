import type { RunDescriptor } from "./lifecycle.ts";
import { describe, expect, test } from "bun:test";
import { createAdminJourneyOperations } from "./admin-journey.ts";
import { playwrightStagingDirectory } from "./playwright-evidence.ts";

const descriptor: RunDescriptor = {
  version: 1,
  runId: "admin-journey-01",
  project: "iam-e2e-admin-journey-01",
  gatewayPort: 43123,
  origin: "http://127.0.0.1:43123",
  artifactDirectory: "C:/tmp/iam-e2e/admin-journey-01",
  labels: {
    "com.docker.compose.project": "iam-e2e-admin-journey-01",
    "com.shgas-iam.e2e.run-id": "admin-journey-01",
  },
};

describe("Admin Custom SSO journey operations", () => {
  test("preflights Chromium and runs the one workspace-local Playwright project", async () => {
    const calls: Array<{
      command: string;
      args: string[];
      env?: NodeJS.ProcessEnv;
    }> = [];
    const operations = createAdminJourneyOperations({
      repositoryRoot: "D:/repo",
      workspaceRoot: "D:/repo/e2e/system",
      accessPath: async () => undefined,
      playwrightCliPath: "D:/repo/e2e/system/node_modules/playwright/cli.js",
      runCommand: async (command, args, options) => {
        calls.push({ command, args, env: options.env });
      },
    });

    await operations.preflight();
    await operations.runJourney(descriptor);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      command: "node",
      args: ["src/playwright-browser-preflight.ts"],
    });
    expect(calls[1]).toMatchObject({
      command: "node",
      args: [
        "D:/repo/e2e/system/node_modules/playwright/cli.js",
        "test",
        "--config",
        "e2e/system/playwright.config.ts",
        "--project",
        "chromium",
      ],
    });
    expect(calls[1]?.env).toMatchObject({
      IAM_E2E_ORIGIN: descriptor.origin,
      IAM_E2E_RUN_ID: descriptor.runId,
      IAM_E2E_ADMIN_CLIENT_CODE: "e2e-admin-admin-journey-01",
      IAM_E2E_CUSTOM_SSO_CLIENT_CODE: "e2e-custom-admin-journey-01",
      IAM_E2E_CUSTOM_SSO_REDIRECT_URI:
        "http://127.0.0.1:43123/e2e/custom-sso/*",
      IAM_E2E_PLAYWRIGHT_OUTPUT_DIR: playwrightStagingDirectory(descriptor),
    });
    expect(calls[1]?.env?.IAM_E2E_ADMIN_PASSWORD).toBeTruthy();
    expect(calls[1]?.env?.IAM_E2E_ADMIN_CLIENT_CODE).not.toBe(
      calls[1]?.env?.IAM_E2E_CUSTOM_SSO_CLIENT_CODE,
    );
  });
});
