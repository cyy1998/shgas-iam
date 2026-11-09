import { createMaintenancePostgresResources } from "@iam/db/maintenance";
import { createOrganizationDocumentProcessor } from "@iam/documents/organization/maintenance";
import { createOrganizationDocumentWriteResources } from "@iam/documents/organization/producer";
import { closeMaintenanceResources } from "@iam/runtime/maintenance";
import type { OrganizationDocumentBackfillCommandEnv } from "@ops/env";
import type { OpsLogger } from "./runtime";

export function createOrganizationDocumentCommandComposition(options: {
  env: OrganizationDocumentBackfillCommandEnv;
  logger: OpsLogger;
  deadlineMs: number;
}) {
  const postgres = createMaintenancePostgresResources({
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
      closing ??= closeMaintenanceResources([resources.close(), postgres.close(signal)]);
      return closing;
    },
  };
}

export const createOrganizationDocumentBackfillCommandComposition = createOrganizationDocumentCommandComposition;
