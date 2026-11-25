import { relations } from "@iam/db/relations";
import { createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type DocumentsPostgresTestHarness = Awaited<ReturnType<typeof createDocumentsPostgresTestHarness>>;

export async function createDocumentsPostgresTestHarness(max = 6) {
  const pg = await createPostgresTestHarness({
    environment: process.env,
    name: "IAM_DOCUMENTS_TEST_DATABASE_URL",
    forbiddenEnvironmentNames: [
      "IAM_AUTH_API_DATABASE_URL",
      "IAM_SSO_API_DATABASE_URL",
      "IAM_INTEGRATION_API_DATABASE_URL",
      "IAM_WORKER_DATABASE_URL",
    ],
    client: { max, onnotice() {} },
  });
  return { ...pg, db: drizzle({ client: pg.sql, relations }) };
}
