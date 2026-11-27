import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./command-runner.ts";
import { readE2ERunContext } from "./e2e-context.ts";
import { cleanupE2EProject, withE2ERuntime } from "./e2e-runtime.ts";
import { runManagedIamJourney } from "./managed-iam-journey.ts";
import { parsePlaywrightArguments } from "./playwright-arguments.ts";
import { recoverExactProject } from "./recovery.ts";
import { wecomSecret } from "./wecom-provider.ts";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = resolve(workspaceRoot, "../..");

async function runContainerPlaywright(args: string[]) {
  const { runtime, playwright } = parsePlaywrightArguments(args);
  await withE2ERuntime({ repositoryRoot, ...runtime }, async (contextPath, signal) => {
    const context = await readE2ERunContext(contextPath);
    console.log(`[e2e] Runtime ${context.project}; context ${contextPath}`);
    await runCommand("node", [join(workspaceRoot, "node_modules/@playwright/test/cli.js"), "test", ...playwright], {
      cwd: workspaceRoot,
      inheritOutput: true,
      signal,
      env: {
        ...process.env,
        DATABASE_URL: context.databaseUrl,
        IAM_E2E_BUN_EXECUTABLE: process.execPath,
        IAM_E2E_CONTEXT_PATH: contextPath,
        IAM_E2E_INTERACTIVE: process.stdout.isTTY ? "1" : "0",
        IAM_E2E_ADMIN_PASSWORD: context.adminPassword,
        IAM_E2E_INTERNAL_API_KEY: context.internalApiKey,
        IAM_E2E_CONTROL_TOKEN: context.control.token,
        IAM_E2E_STUBS_TOKEN: context.stubsToken,
        IAM_E2E_DATABASE_PASSWORD: decodeURIComponent(new URL(context.databaseUrl).password),
        IAM_E2E_WECOM_SECRET: wecomSecret,
        PLAYWRIGHT_LAST_RUN_OUTPUT_FILE:
          process.env.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE ?? join(workspaceRoot, ".cache", "last-run.json"),
      },
    });
  });
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
  const project = await recoverExactProject(target, (project) => cleanupE2EProject(repositoryRoot, project), {
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
    await runContainerPlaywright(args);
  } else if ((command === "managed" && args.length === 0) || command === "e2e") {
    await withCapturableSignals(runManagedIamJourney);
  } else if (command === "cleanup") {
    await withCapturableSignals((signal) => runRecovery(args, signal));
  } else {
    throw new Error("expected command: e2e | managed | cleanup");
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
