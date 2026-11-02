import { parseDocumentRepairInvocation, parseWorkerEnv } from "@worker/env";

async function main() {
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const { createWorkerComposition } = await import("@worker/composition");
  const composition = await createWorkerComposition({ env, logger });

  logger.info(
    {
      enabledModules: composition.enabledModules.map((module) => module.key),
      dashboardEnabled: env.dashboard.enabled,
      httpEnabled: env.http.enabled,
      port: env.http.enabled ? env.http.port : undefined,
    },
    "worker started",
  );

  process.once("SIGINT", () => void composition.shutdown("SIGINT"));
  process.once("SIGTERM", () => void composition.shutdown("SIGTERM"));
}

if (process.argv[2] === "--internal-document-repair") {
  try {
    if (process.argv.length !== 3) throw new Error("Unexpected private repair arguments");
    const input = parseDocumentRepairInvocation(process.env);
    const { executeDocumentRepairInvocation } = await import("@worker/maintenance/document-repair");
    await executeDocumentRepairInvocation(input);
  } catch {
    process.exitCode = 1;
    process.stderr.write("Invalid private Worker repair invocation.\n");
  }
} else {
  void main();
}
