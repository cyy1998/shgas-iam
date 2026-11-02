import { createMaintenancePostgresResources } from "@iam/db/maintenance";
import { createEmploymentRepository, createEmploymentVerifier } from "@iam/user-document/maintenance";
import type { OpsLogger } from "./runtime";

export function createEmploymentCommandComposition(options: { databaseUrl: string; logger: OpsLogger }) {
  // The existing Employment diagnostic has no statement deadline; keep PostgreSQL's disabled value.
  const resources = createMaintenancePostgresResources({ databaseUrl: options.databaseUrl, deadlineMs: 0 });
  return {
    logger: options.logger,
    employment: {
      verifier: createEmploymentVerifier({
        inventory: createEmploymentRepository(resources.db),
        clock: { nowDate: () => new Date() },
      }),
    },
    shutdown: () => resources.close("command-completed"),
  };
}
