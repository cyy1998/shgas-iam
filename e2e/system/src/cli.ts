import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./command-runner.ts";
import { readHybridRunContext } from "./hybrid-context.ts";
import { cleanupHybridProject, cleanupHybridResident } from "./hybrid-middleware.ts";
import { withHybridRuntime } from "./hybrid-runtime.ts";
import { runManagedIamJourney } from "./managed-iam-journey.ts";
import { parsePlaywrightArguments } from "./playwright-arguments.ts";
import { recoverExactProject } from "./recovery.ts";
import { wecomSecret } from "./wecom-provider.ts";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = resolve(workspaceRoot, "../..");
const artifactRoot = join(workspaceRoot, "test-results");
const residentOptions = { repositoryRoot, residentDirectory: process.env.IAM_E2E_RESIDENT_DIRECTORY };

async function runHybridPlaywright(args: string[]) {
  const { runtime, playwright } = parsePlaywrightArguments(args);
  const override = process.env.IAM_E2E_LIFECYCLE;
  if (override !== undefined && override !== "resident" && override !== "fresh") {
    throw new Error("IAM_E2E_LIFECYCLE must be resident or fresh");
  }
  await withHybridRuntime(
    { ...residentOptions, ...runtime, artifactRoot, lifecycle: runtime.fresh ? "fresh" : override },
    async (contextPath, signal, hostEnvironment) => {
      const context = await readHybridRunContext(contextPath);
      console.log(`[e2e] Runtime ${context.project}; context ${contextPath}`);
      await runCommand("node", [join(workspaceRoot, "node_modules/@playwright/test/cli.js"), "test", ...playwright], {
        cwd: workspaceRoot,
        inheritOutput: true,
        signal,
        env: {
          ...hostEnvironment,
          DATABASE_URL: context.databaseUrl,
          IAM_E2E_BUN_EXECUTABLE: process.execPath,
          IAM_E2E_CONTEXT_PATH: contextPath,
          IAM_E2E_INTERACTIVE: process.stdout.isTTY ? "1" : "0",
          IAM_E2E_ADMIN_PASSWORD: context.adminPassword,
          IAM_E2E_INTERNAL_API_KEY: context.internalApiKey,
          IAM_E2E_CONTROL_TOKEN: context.control.token,
          IAM_E2E_DATABASE_PASSWORD: decodeURIComponent(new URL(context.databaseUrl).password),
          IAM_E2E_WECOM_SECRET: wecomSecret,
          PLAYWRIGHT_LAST_RUN_OUTPUT_FILE:
            process.env.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE ?? join(workspaceRoot, ".cache", "last-run.json"),
        },
      });
    },
  );
}

async function runRecovery(args: string[], signal: AbortSignal) {
  const [flag, value] = args[0] === "--" ? args.slice(1) : args;
  if (
    args.length !== (args[0] === "--" ? 3 : 2) ||
    !value?.trim() ||
    (flag !== "--descriptor" && flag !== "--project")
  ) {
    throw new Error("cleanup requires exactly one --descriptor <path> or --project <exact-project>");
  }
  const target = flag === "--descriptor" ? { descriptorPath: value } : { project: value };
  const project = await recoverExactProject(target, (project) => cleanupHybridProject(residentOptions, project), {
    signal,
  });
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

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "e2e" && args.join(" ") !== "--managed" && args.join(" ") !== "-- --managed") {
    await runHybridPlaywright(args);
  } else if ((command === "managed" && args.length === 0) || command === "e2e") {
    await withCapturableSignals(runManagedIamJourney);
  } else if (command === "container-smoke" && args.length === 0) {
    const { runContainerSmoke } = await import("./container-smoke.ts");
    await withCapturableSignals((signal) => runContainerSmoke({ repositoryRoot, workspaceRoot, signal }));
  } else if (command === "cleanup") {
    await withCapturableSignals((signal) => runRecovery(args, signal));
  } else if (command === "down" && args.length === 0) {
    await withCapturableSignals(async () => {
      await cleanupHybridResident(residentOptions);
      console.log("[e2e] Resident middleware is down");
    });
  } else {
    throw new Error("expected command: e2e | managed | container-smoke | down | cleanup");
  }
} catch (error) {
  console.error(formatFailure(error));
  process.exitCode = 1;
}

function formatFailure(error: unknown): string {
  if (error instanceof AggregateError) {
    return [error.message, ...error.errors.map(formatFailure)].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}
