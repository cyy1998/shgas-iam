import { randomUUID } from "node:crypto";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createOrganizationSearchPostgresResources(options: { databaseUrl: string; deadlineMs: number }) {
  // PostgreSQL truncates application_name to 63 bytes. Both this 44-byte name
  // and its 51-byte cancellation name must retain the full invocation UUID.
  const applicationName = `iam-org-${randomUUID()}`;
  const client = postgres(options.databaseUrl, {
    max: 1,
    connect_timeout: 2,
    connection: { application_name: applicationName, statement_timeout: options.deadlineMs },
  });
  const db = drizzle({ client, relations });
  let closing: Promise<void> | undefined;

  async function closeResources(reason: string) {
    // Postgres.js end({timeout}) sends a graceful socket end, which cannot
    // stop a server-side blocked statement. Cancel this invocation before end.
    const failures: unknown[] = [];
    if (reason !== "command-completed") {
      const cancellation = postgres(options.databaseUrl, {
        max: 1,
        connect_timeout: 2,
        connection: { application_name: `${applicationName}-cancel`, statement_timeout: 1000 },
      });
      try {
        await cancellation`SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name = ${applicationName}
          AND datname = current_database() AND usename = current_user AND state = 'active'`;
      } catch (error) {
        failures.push(error);
      } finally {
        try {
          await cancellation.end({ timeout: 1 });
        } catch (error) {
          failures.push(error);
        }
      }
    }
    try {
      await client.end({ timeout: 1 });
    } catch (error) {
      failures.push(error);
    }
    if (failures.length) throw new AggregateError(failures, "Organization search PostgreSQL shutdown failed");
  }

  return {
    db,
    applicationName,
    close(reason: string) {
      closing ??= closeResources(reason);
      return closing;
    },
  };
}
