import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDatabaseResource(databaseUrl: string, applicationName: string, readOnly = false) {
  const client = postgres(databaseUrl, {
    connect_timeout: 5,
    connection: {
      application_name: applicationName,
      ...(readOnly && { default_transaction_read_only: true, statement_timeout: 2_000 }),
    },
  });
  return {
    db: drizzle({ client, relations }),
    close: () => client.end({ timeout: 5 }),
  };
}
