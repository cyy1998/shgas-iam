import { parseArgs } from "node:util";
import type { OrganizationSearchVerificationReport } from "@iam/organization-search-read-model/worker";
import { parseOrganizationCommandDeadline, runOrganizationSearchCommandWithLifecycle } from "./command-lifecycle";

export async function runOrganizationSearchVerifyCommand(
  deps: {
    verifier: { verify: (options?: { signal?: AbortSignal }) => Promise<OrganizationSearchVerificationReport> };
    logger: { info: (data: Record<string, unknown>, message: string) => void };
  },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  deps.logger.info({}, "Organization search full verification started");
  const report = await deps.verifier.verify({ signal });
  signal?.throwIfAborted();
  deps.logger.info({ ...report }, "Organization search full verification completed");
  return report;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: { "deadline-ms": { type: "string" } },
  });
  const deadlineMs = parseOrganizationCommandDeadline(values["deadline-ms"]);
  const { parseOrganizationSearchVerifyCommandEnv } = await import("@worker/env");
  const env = parseOrganizationSearchVerifyCommandEnv(process.env);
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  const { createOrganizationSearchVerifyCommandComposition } = await import(
    "@worker/composition/organization-search-verify-command"
  );
  const composition = createOrganizationSearchVerifyCommandComposition({
    logger,
    databaseUrl: env.databaseUrl,
    deadlineMs,
  });
  const report = await runOrganizationSearchCommandWithLifecycle({
    deadlineMs,
    shutdown: composition.shutdown,
    run: (signal) => runOrganizationSearchVerifyCommand({ verifier: composition.verifier, logger }, signal),
  });
  if (report.status === "failed") process.exitCode = 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    process.exitCode = process.exitCode || 1;
    process.stderr.write(
      "Organization search verification failed; keep maintenance active and inspect the full report.\n",
    );
  }
}
