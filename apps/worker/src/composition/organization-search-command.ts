import { createOrganizationSearchWriteResources } from "@iam/organization-search-read-model/producer";
import { createOrganizationSearchProcessor } from "@iam/organization-search-read-model/worker";
import type { OrganizationSearchBackfillCommandEnv } from "@worker/env";
import { closeWorkerCommandResources } from "./command-shutdown";
import { createOrganizationSearchPostgresResources } from "./organization-search-postgres-resources";
import type { WorkerLogger } from "./runtime";

export function createOrganizationSearchCommandComposition(options: {
  env: OrganizationSearchBackfillCommandEnv;
  logger: WorkerLogger;
  deadlineMs: number;
}) {
  const postgres = createOrganizationSearchPostgresResources({
    databaseUrl: options.env.databaseUrl,
    deadlineMs: options.deadlineMs,
  });
  const resources = createOrganizationSearchWriteResources({
    redis: options.env.redis,
    logger: options.logger,
  });
  const processor = createOrganizationSearchProcessor({ db: postgres.db, jobProducer: resources.jobProducer });
  let closing: Promise<void> | undefined;
  return {
    processor,
    shutdown(signal: string) {
      options.logger.info(
        { signal, applicationName: postgres.applicationName },
        "Organization search command shutting down",
      );
      closing ??= closeWorkerCommandResources([resources.close(), postgres.close(signal)]);
      return closing;
    },
  };
}

export const createOrganizationSearchBackfillCommandComposition = createOrganizationSearchCommandComposition;
