import { parseArgs } from "node:util";
import type { OrganizationDocumentVerificationReport } from "@iam/organization-document/maintenance";
import { runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";
import { parseDocumentCommandDeadline } from "../document-command-lifecycle";

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

async function main(args: string[]) {
  const { values } = parseArgs({
    args: args,
    strict: true,
    options: { "deadline-ms": { type: "string" } },
  });
  const deadlineMs = parseDocumentCommandDeadline(values["deadline-ms"]);
  const { parseOrganizationDocumentVerifyCommandEnv } = await import("@ops/env");
  const env = parseOrganizationDocumentVerifyCommandEnv(process.env);
  const { createLogger, LoggerSourceApp } = await import("@iam/runtime/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Ops,
  });
  const { createOrganizationDocumentVerifyCommandComposition } = await import(
    "@ops/composition/organization-document-verify-command"
  );
  const composition = createOrganizationDocumentVerifyCommandComposition({
    logger,
    databaseUrl: env.databaseUrl,
    deadlineMs,
  });
  const report = await runMaintenanceCommandWithLifecycle({
    signals: process,
    deadlineMs,
    shutdown: composition.shutdown,
    run: (signal) => runOrganizationDocumentVerifyCommand({ verifier: composition.verifier, logger }, signal),
  });
  if (report.status === "failed") process.exitCode = 1;
}

export async function run(args: string[]) {
  try {
    await main(args);
  } catch {
    process.exitCode = process.exitCode || 1;
    process.stderr.write(
      "Organization document verification failed; keep maintenance active and inspect the full report.\n",
    );
  }
}
