import { createOrganizationSearchVerifier } from "@iam/organization-search-read-model/worker";
import { createOrganizationSearchPostgresResources } from "./organization-search-postgres-resources";
import type { WorkerLogger } from "./runtime";

export function createOrganizationSearchVerifyCommandComposition(options: {
  databaseUrl: string;
  logger: WorkerLogger;
  deadlineMs: number;
}) {
  const resources = createOrganizationSearchPostgresResources(options);
  let closing: Promise<void> | undefined;
  return {
    verifier: createOrganizationSearchVerifier({ db: resources.db }),
    shutdown(reason: string) {
      options.logger.info(
        { reason, applicationName: resources.applicationName },
        "Organization search verification command shutting down",
      );
      closing ??= resources.close(reason);
      return closing;
    },
  };
}
