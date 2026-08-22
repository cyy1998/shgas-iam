import type { RunDescriptor } from "./lifecycle.ts";
import { describe, expect, test } from "bun:test";
import { createOidcJourneyOperations } from "./oidc-journey.ts";
import { playwrightStagingDirectory } from "./playwright-evidence.ts";

const descriptor: RunDescriptor = {
  version: 1,
  runId: "oidc-journey-01",
  project: "iam-e2e-oidc-journey-01",
  gatewayPort: 43123,
  origin: "http://127.0.0.1:43123",
  artifactDirectory: "C:/tmp/iam-e2e/oidc-journey-01",
  labels: {
    "com.docker.compose.project": "iam-e2e-oidc-journey-01",
    "com.shgas-iam.e2e.run-id": "oidc-journey-01",
  },
};

describe("OIDC PKCE journey operations", () => {
  test("preflights Chromium and runs only the OIDC Playwright journey", async () => {
    const checkedPaths: string[] = [];
    const calls: Array<{
      command: string;
      args: string[];
      env?: NodeJS.ProcessEnv;
    }> = [];
    const operations = createOidcJourneyOperations({
      repositoryRoot: "D:/repo",
      workspaceRoot: "D:/repo/e2e/system",
      accessPath: async path => checkedPaths.push(path),
      playwrightCliPath: "D:/repo/e2e/system/node_modules/playwright/cli.js",
      runCommand: async (command, args, options) => {
        calls.push({ command, args, env: options.env });
      },
    });

    await operations.preflight();
    await operations.runJourney(descriptor);

    expect(checkedPaths.map(path => path.replaceAll("\\", "/"))).toEqual([
      "D:/repo/e2e/system/oidc-pkce.spec.ts",
      "D:/repo/e2e/system/playwright.config.ts",
      "D:/repo/e2e/system/src/playwright-browser-preflight.ts",
    ]);
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
      IAM_E2E_JOURNEY: "oidc",
      IAM_E2E_ORIGIN: descriptor.origin,
      IAM_E2E_RUN_ID: descriptor.runId,
      IAM_E2E_ADMIN_USERNAME: "e2e-admin-oidc-journey-01",
      IAM_E2E_OIDC_CLIENT_CODE: "e2e-oidc-oidc-journey-01",
      IAM_E2E_OIDC_REDIRECT_URI:
        "http://127.0.0.1:43123/e2e/oidc/callback",
      IAM_E2E_INTERNAL_API_KEY:
        "iam-e2e-internal-api-key-oidc-journey-01",
      IAM_E2E_RESPONSIBILITY_TARGET_ORGANIZATION_CODE:
        "e2e-resp-target-oidc-journey-01",
      IAM_E2E_RESPONSIBILITY_HOLDER_POSITION_CODE:
        "e2e-resp-pos-oidc-journey-01",
      IAM_E2E_PLAYWRIGHT_OUTPUT_DIR: playwrightStagingDirectory(descriptor),
    });
    expect(calls[1]?.env?.IAM_E2E_ADMIN_PASSWORD).toBeTruthy();
  });
});
