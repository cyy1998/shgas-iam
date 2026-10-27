import { createOrganizationDocumentWriteResources } from "@iam/organization-document/producer";
import { createOrganizationDocumentProcessor } from "@iam/organization-document/worker";
import type { OrganizationDocumentBackfillCommandEnv } from "@worker/env";
import { closeWorkerCommandResources } from "./command-shutdown";
import { createDocumentCommandPostgresResources } from "./document-postgres-resources";
import type { WorkerLogger } from "./runtime";

export function createOrganizationDocumentCommandComposition(options: {
  env: OrganizationDocumentBackfillCommandEnv;
  logger: WorkerLogger;
  deadlineMs: number;
}) {
  const postgres = createDocumentCommandPostgresResources({
    databaseUrl: options.env.databaseUrl,
    deadlineMs: options.deadlineMs,
  });
  const resources = createOrganizationDocumentWriteResources({
    redis: options.env.redis,
    logger: options.logger,
  });
  const processor = createOrganizationDocumentProcessor({ db: postgres.db, jobProducer: resources.jobProducer });
  let closing: Promise<void> | undefined;
  return {
    processor,
    shutdown(signal: string) {
      options.logger.info(
        { signal, applicationName: postgres.applicationName },
        "Organization document command shutting down",
      );
      closing ??= closeWorkerCommandResources([resources.close(), postgres.close(signal)]);
      return closing;
    },
  };
}

export const createOrganizationDocumentBackfillCommandComposition = createOrganizationDocumentCommandComposition;
