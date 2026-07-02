import { parseWorkerEnv } from "@worker/env";

async function main() {
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const { createWorkerComposition } = await import("@worker/composition");
  const composition = await createWorkerComposition({ env, logger });

  logger.info({
    enabledModules: composition.enabledModules.map(module => module.key),
    dashboardEnabled: env.dashboard.enabled,
    httpEnabled: env.http.enabled,
    port: env.http.enabled ? env.http.port : undefined,
  }, "worker started");

  process.once("SIGINT", () => void composition.shutdown("SIGINT"));
  process.once("SIGTERM", () => void composition.shutdown("SIGTERM"));
}

void main();
