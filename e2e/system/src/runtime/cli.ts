import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatResourceFailure } from "../../../../scripts/test-resources/managed-resources.mjs";
import { runOwnedCommand } from "../../../../scripts/test-resources/owned-command.mjs";
import { runManagedIamJourney } from "../journeys/managed-iam-journey.ts";
import { readE2ERunContext } from "./e2e-context.ts";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const repositoryRoot = resolve(workspaceRoot, "../..");

export function parsePlaywrightArguments(args: string[]) {
  const boundary = args.indexOf("--");
  const options = args.slice(0, boundary === -1 ? args.length : boundary);
  const runtime = {
    skipBuild: options.includes("--skip-build"),
    keep: options.includes("--keep"),
  };
  const playwright = options.filter((arg) => arg !== "--skip-build" && arg !== "--keep");
  if (boundary !== -1) playwright.push(...args.slice(boundary));
  return { runtime, playwright };
}

async function runContainerPlaywright(args: string[]) {
  const { withE2ERuntime } = await import("./e2e-runtime.ts");
  const { runtime, playwright } = parsePlaywrightArguments(args);
  await withE2ERuntime({ repositoryRoot, ...runtime }, async (contextPath, signal) => {
    const context = await readE2ERunContext(contextPath);
    console.log(`[e2e] Runtime ${context.project}; context ${contextPath}`);
    const result = await runOwnedCommand({
      executable: "node",
      args: [join(workspaceRoot, "node_modules/@playwright/test/cli.js"), "test", ...playwright],
      cwd: workspaceRoot,
      inheritOutput: true,
      fullLogFile: join(dirname(contextPath), "playwright.log"),
      signal,
      env: {
        ...process.env,
        DATABASE_URL: context.databaseUrl,
        IAM_E2E_BUN_EXECUTABLE: process.execPath,
        IAM_E2E_CONTEXT_PATH: contextPath,
        PLAYWRIGHT_LAST_RUN_OUTPUT_FILE:
          process.env.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE ?? join(workspaceRoot, ".cache", "last-run.json"),
      },
    });
    if (result.exitCode !== 0) throw new Error(`Playwright exited with code ${result.exitCode}`);
  });
}

async function cleanupProject(args: string[]) {
  const [flag, project, ...extra] = args[0] === "--" ? args.slice(1) : args;
  if (flag !== "--project" || !project || extra.length > 0) {
    throw new Error("cleanup requires --project <exact-project>");
  }
  const { cleanupE2EProject } = await import("./e2e-runtime.ts");
  await cleanupE2EProject(repositoryRoot, project);
  console.log(JSON.stringify({ status: "exact-project-cleaned", project }));
}

async function withCapturableSignals(operation: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  const onSigint = () => controller.abort(new Error("received SIGINT"));
  const onSigterm = () => controller.abort(new Error("received SIGTERM"));
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  try {
    await operation(controller.signal);
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "e2e" && args.join(" ") !== "--managed" && args.join(" ") !== "-- --managed") {
      await runContainerPlaywright(args);
    } else if ((command === "managed" && args.length === 0) || command === "e2e") {
      await withCapturableSignals(runManagedIamJourney);
    } else if (command === "cleanup") {
      await cleanupProject(args);
    } else {
      throw new Error("expected command: e2e | managed | cleanup");
    }
  } catch (error) {
    console.error(formatResourceFailure(error));
    process.exitCode = 1;
  }
}
