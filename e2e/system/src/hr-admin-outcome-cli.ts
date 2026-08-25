import db, { closeDb } from "@iam/db";
import { requireEnvironment } from "./environment.ts";
import { createProductionHrAdminOutcomeOwner } from "./hr-admin-outcome-owner.ts";
import { verifyHrAdminOutcome } from "./hr-admin-outcome.ts";
import { createE2EScenarioIdentity } from "./seed.ts";

async function run() {
  const runId = requireEnvironment("IAM_E2E_RUN_ID");
  const scenario = createE2EScenarioIdentity(runId);
  try {
    const result = await verifyHrAdminOutcome({
      owner: createProductionHrAdminOutcomeOwner(db),
      scenario: { runId, ...scenario },
    });
    console.log(JSON.stringify(result));
  }
  finally {
    await closeDb({ timeoutSeconds: 5 });
  }
}

run().catch(() => {
  console.error("HR Admin outcome verification failed");
  process.exitCode = 1;
});
