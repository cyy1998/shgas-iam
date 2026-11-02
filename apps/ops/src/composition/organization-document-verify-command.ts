import { createMaintenancePostgresResources } from "@iam/db/maintenance";
import { createOrganizationDocumentVerifier } from "@iam/organization-document/maintenance";
import type { OpsLogger } from "./runtime";

export function createOrganizationDocumentVerifyCommandComposition(options: {
  databaseUrl: string;
  logger: OpsLogger;
  deadlineMs: number;
}) {
  const resources = createMaintenancePostgresResources(options);
  let closing: Promise<void> | undefined;
  return {
    verifier: createOrganizationDocumentVerifier({ db: resources.db }),
    shutdown(reason: string) {
      options.logger.info(
        { reason, applicationName: resources.applicationName },
        "Organization document verification command shutting down",
      );
      closing ??= resources.close(reason);
      return closing;
    },
  };
}
