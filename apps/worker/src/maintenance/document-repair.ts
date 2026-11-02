import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import { MaintenanceCommandCleanupError, runMaintenanceCommandWithLifecycle } from "@iam/api-core/maintenance";
import { createOrganizationDocumentCommandComposition } from "@worker/composition/organization-document-command";
import { createUserDocumentCommandComposition } from "@worker/composition/user-document-command";
import type { DocumentRepairInvocation } from "@worker/env";
import { DOCUMENT_REPAIR_CLEANUP_FAILURE_EXIT_CODE } from "@worker/maintenance/document-repair-protocol";

export async function executeDocumentRepairInvocation(input: DocumentRepairInvocation) {
  const logger = createLogger({
    nodeEnv: input.env.nodeEnv,
    logLevel: input.env.log.level,
    logFormat: input.env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  try {
    if (input.document === "user") {
      const composition = createUserDocumentCommandComposition({
        env: input.env,
        logger,
        deadlineMs: input.deadlineMs,
        limit: input.limit,
        postgresInvocationId: input.postgresInvocationId,
      });
      const report = await runMaintenanceCommandWithLifecycle({
        signals: process,
        deadlineMs: input.deadlineMs,
        shutdown: composition.shutdown,
        run: async (signal) => {
          await composition.connect();
          return await composition.repair({ limit: input.limit, signal });
        },
      });
      if (report.subjectAccess.failed || report.transitionRecovery.failed) process.exitCode = 1;
    } else {
      const composition = createOrganizationDocumentCommandComposition({
        env: input.env,
        logger,
        deadlineMs: input.deadlineMs,
        postgresInvocationId: input.postgresInvocationId,
      });
      const report = await runMaintenanceCommandWithLifecycle({
        signals: process,
        deadlineMs: input.deadlineMs,
        shutdown: composition.shutdown,
        run: async (signal) =>
          await composition.processor.repairFailedOrStale({
            limit: input.limit,
            staleBefore: new Date(Date.now() - input.env.organizationDocument.repairStaleSeconds * 1000),
            signal,
          }),
      });
      logger.info(
        { ...report, publication: "not-verified" },
        "Organization document repair wakeups finished; wait for publication and run verification",
      );
      if (report.failed) process.exitCode = 1;
    }
  } catch (error) {
    process.exitCode =
      error instanceof MaintenanceCommandCleanupError
        ? DOCUMENT_REPAIR_CLEANUP_FAILURE_EXIT_CODE
        : process.exitCode || 1;
    logger.error(
      { event: "document.repair.child.failed", cleanupFailed: error instanceof MaintenanceCommandCleanupError },
      "Document repair failed; durable work remains for retry",
    );
  }
}
