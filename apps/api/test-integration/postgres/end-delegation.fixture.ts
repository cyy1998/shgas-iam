import process from "node:process";
import { createApiRepositories } from "@api/composition/repositories";
import { createApiUnitOfWork } from "@api/composition/tx";
import { createPrivilegeDelegationService } from "@api/services/privilege/privilegeDelegation.service";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { PrivilegeDelegationStatus } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

async function main() {
  // The Admin PostgreSQL harness owns this schema and invokes the API command in its own workspace.
  const databaseUrl = process.env.IAM_API_TEST_DATABASE_URL;
  const delegationId = Number(process.argv[2]);
  if (!databaseUrl || !Number.isSafeInteger(delegationId) || delegationId <= 0)
    throw new Error("A dedicated test database and delegation ID are required");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const db = drizzle({ client: sql, relations });
    const uow = createApiUnitOfWork({
      db,
      logger: { error() {}, warn() {} },
      clock: { nowDate: () => new Date() },
      userProfileJobProducer: { enqueueRebuildJobs: async () => ({ enqueued: 0, jobIds: [] }) },
    });
    const service = createPrivilegeDelegationService({
      privilegeDelegationRepository: createApiRepositories(db).privilegeDelegation,
      uow: mapUnitOfWork(uow, tx => ({
        userRepository: tx.repositories.user,
        organizationRepository: tx.repositories.organization,
        privilegeRepository: tx.repositories.privilege,
        privilegeDelegationRepository: tx.repositories.privilegeDelegation,
        auditLogWriter: tx.auditLogWriter,
      })),
    });
    await service.updateDelegation(delegationId, { status: PrivilegeDelegationStatus.Disable }, {
      actor: {
        actorType: "client",
        actorUserId: null,
        actorUsername: null,
        actorClientCode: "delegation-deletion-contract",
        actorSystemKey: null,
      },
    });
  }
  finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
