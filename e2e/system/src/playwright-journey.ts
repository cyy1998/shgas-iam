import type { CommandRunner } from "./docker-infra.ts";
import type { RunDescriptor } from "./lifecycle.ts";
import type { E2EScenarioIdentity } from "./seed.ts";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { playwrightStagingDirectory } from "./playwright-evidence.ts";
import { createE2EScenarioIdentity } from "./seed.ts";

const syntheticAdminPassword = "iam-e2e-admin-password-local-only";
const require = createRequire(import.meta.url);
const defaultPlaywrightCliPath = join(
  dirname(require.resolve("@playwright/test/package.json")),
  "cli.js",
);

export interface PlaywrightJourneyRuntimeOptions {
  repositoryRoot: string;
  workspaceRoot: string;
  runCommand: CommandRunner;
  accessPath?: (path: string) => Promise<unknown>;
  playwrightCliPath?: string;
}

interface CreatePlaywrightJourneyOperationsOptions
  extends PlaywrightJourneyRuntimeOptions {
  specPath: string;
  environment: (
    descriptor: RunDescriptor,
    scenario: E2EScenarioIdentity,
  ) => NodeJS.ProcessEnv | Promise<NodeJS.ProcessEnv>;
}

export function createPlaywrightJourneyOperations(
  options: CreatePlaywrightJourneyOperationsOptions,
) {
  const accessPath = options.accessPath ?? access;
  const playwrightCliPath = options.playwrightCliPath
    ?? defaultPlaywrightCliPath;
  return {
    async preflight(signal?: AbortSignal) {
      await Promise.all([
        options.specPath,
        "playwright.config.ts",
        join("src", "playwright-browser-preflight.ts"),
      ].map(path => accessPath(join(options.workspaceRoot, path))));
      await options.runCommand(
        "node",
        ["src/playwright-browser-preflight.ts"],
        { cwd: options.workspaceRoot, signal },
      );
    },

    async runJourney(descriptor: RunDescriptor, signal?: AbortSignal) {
      const scenario = createE2EScenarioIdentity(descriptor.runId);
      const environment = await options.environment(descriptor, scenario);
      await options.runCommand(
        "node",
        [
          playwrightCliPath,
          "test",
          "--config",
          repositoryRelativePath(
            options.repositoryRoot,
            join(options.workspaceRoot, "playwright.config.ts"),
          ),
          "--project",
          "chromium",
        ],
        {
          cwd: options.repositoryRoot,
          env: {
            ...process.env,
            IAM_E2E_ADMIN_PASSWORD: syntheticAdminPassword,
            IAM_E2E_ADMIN_USERNAME: scenario.adminUsername,
            IAM_E2E_ORIGIN: descriptor.origin,
            IAM_E2E_PLAYWRIGHT_OUTPUT_DIR:
              playwrightStagingDirectory(descriptor),
            IAM_E2E_RUN_ID: descriptor.runId,
            ...environment,
          },
          signal,
        },
      );
    },
  };
}

function repositoryRelativePath(repositoryRoot: string, path: string) {
  return relative(repositoryRoot, path).split(sep).join("/");
}
