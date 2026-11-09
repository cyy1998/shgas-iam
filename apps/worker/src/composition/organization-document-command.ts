import { createMaintenancePostgresResources } from "@iam/db/maintenance";
import { createOrganizationDocumentProcessor } from "@iam/organization-document/maintenance";
import { createOrganizationDocumentWriteResources } from "@iam/organization-document/producer";
import { closeMaintenanceResources } from "@iam/runtime/maintenance";
import type { DocumentRepairInvocation } from "@worker/env";

type OrganizationDocumentRepairEnv = Pick<
  DocumentRepairInvocation["env"],
  "databaseUrl" | "redis" | "organizationDocument"
>;

import type { WorkerLogger } from "./runtime";

export function createOrganizationDocumentCommandComposition(options: {
  env: OrganizationDocumentRepairEnv;
  logger: WorkerLogger;
  deadlineMs: number;
  postgresInvocationId: string;
}) {
  const postgres = createMaintenancePostgresResources({
    databaseUrl: options.env.databaseUrl,
    deadlineMs: options.deadlineMs,
    invocationId: options.postgresInvocationId,
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
