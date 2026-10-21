import { createAuditRepository } from "@api/services/audit/audit.repository";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { relations } from "@iam/db/relations";
import { ClientDelegationStatus, createDelegationService } from "@iam/delegation";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.IAM_API_TEST_DATABASE_URL;
if (!url) throw new Error("IAM_API_TEST_DATABASE_URL is required");
const client = postgres(url);
try {
  const service = createDelegationService({
    db: drizzle({ client, relations }),
    recordAudit: async (tx, event) =>
      createApiAuditLogWriter({ auditRepository: createAuditRepository(tx) }).recordAuditLog(event),
  });
  await service.update(
    Number(process.argv[2]),
    { status: ClientDelegationStatus.Disable },
    { kind: "client", clientId: Number(process.argv[3]) },
    { actionPrefix: "internal", actor: { actorType: "client", actorClientCode: "delegation-test" } },
  );
} finally {
  await client.end();
}
