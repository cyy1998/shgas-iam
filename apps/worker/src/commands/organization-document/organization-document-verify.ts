import { parseArgs } from "node:util";
import type { OrganizationDocumentVerificationReport } from "@iam/organization-document/worker";
import { parseDocumentCommandDeadline, runDocumentCommandWithLifecycle } from "../document-command-lifecycle";

export async function runOrganizationDocumentVerifyCommand(
  deps: {
    verifier: { verify: (options?: { signal?: AbortSignal }) => Promise<OrganizationDocumentVerificationReport> };
    logger: { info: (data: Record<string, unknown>, message: string) => void };
  },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  deps.logger.info({}, "Organization document full verification started");
  const report = await deps.verifier.verify({ signal });
  signal?.throwIfAborted();
  deps.logger.info({ ...report }, "Organization document full verification completed");
  return report;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: { "deadline-ms": { type: "string" } },
  });
  const deadlineMs = parseDocumentCommandDeadline(values["deadline-ms"]);
  const { parseOrganizationDocumentVerifyCommandEnv } = await import("@worker/env");
  const env = parseOrganizationDocumentVerifyCommandEnv(process.env);
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  const { createOrganizationDocumentVerifyCommandComposition } = await import(
    "@worker/composition/organization-document-verify-command"
  );
  const composition = createOrganizationDocumentVerifyCommandComposition({
    logger,
    databaseUrl: env.databaseUrl,
    deadlineMs,
  });
  const report = await runDocumentCommandWithLifecycle({
    deadlineMs,
    shutdown: composition.shutdown,
    run: (signal) => runOrganizationDocumentVerifyCommand({ verifier: composition.verifier, logger }, signal),
  });
  if (report.status === "failed") process.exitCode = 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    process.exitCode = process.exitCode || 1;
    process.stderr.write(
      "Organization document verification failed; keep maintenance active and inspect the full report.\n",
    );
  }
}
