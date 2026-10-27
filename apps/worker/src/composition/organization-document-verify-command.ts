import { createOrganizationDocumentVerifier } from "@iam/organization-document/worker";
import { createDocumentCommandPostgresResources } from "./document-postgres-resources";
import type { WorkerLogger } from "./runtime";

export function createOrganizationDocumentVerifyCommandComposition(options: {
  databaseUrl: string;
  logger: WorkerLogger;
  deadlineMs: number;
}) {
  const resources = createDocumentCommandPostgresResources(options);
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
