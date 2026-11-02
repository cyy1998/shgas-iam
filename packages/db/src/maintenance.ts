import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "./relations";

export function createMaintenancePostgresResources(options: {
  databaseUrl: string;
  deadlineMs: number;
  scope?: "user" | "organization";
  invocationId?: string;
}) {
  // PostgreSQL truncates application_name to 63 bytes. Both the longest 45-byte name
  // and its 52-byte cancellation name must retain the full invocation UUID.
  const applicationName = invocationApplicationName(options.scope, options.invocationId ?? randomUUID());
  const client = postgres(options.databaseUrl, {
    max: 1,
    connect_timeout: 2,
    connection: { application_name: applicationName, statement_timeout: options.deadlineMs },
  });
  const db = drizzle({ client, relations });
  let closing: Promise<void> | undefined;

  return {
    db,
    applicationName,
    close(reason: string) {
      closing ??= closeInvocation({ ...options, applicationName, client, cancel: reason !== "command-completed" });
      return closing;
    },
  };
}

/** Called by the owner after its isolated process has stopped, including forced termination. */
export async function closeMaintenancePostgresInvocation(options: {
  databaseUrl: string;
  scope: "user" | "organization";
  invocationId: string;
}) {
  await closeInvocation({
    ...options,
    applicationName: invocationApplicationName(options.scope, options.invocationId),
    cancel: true,
    confirmStopped: true,
  });
}

function invocationApplicationName(scope: "user" | "organization" | undefined, invocationId: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(invocationId))
    throw new Error("A PostgreSQL maintenance invocation requires a UUID");
  return `iam-${scope === "user" ? "user" : "org"}-${invocationId}`;
}

async function closeInvocation(options: {
  databaseUrl: string;
  applicationName: string;
  client?: ReturnType<typeof postgres>;
  cancel: boolean;
  confirmStopped?: boolean;
}) {
  const { applicationName } = options;
  // Postgres.js end({timeout}) sends a graceful socket end, which cannot
  // stop a server-side blocked statement. Cancel this invocation before end.
  const failures: unknown[] = [];
  const cancellation =
    options.cancel || options.confirmStopped
      ? postgres(options.databaseUrl, {
          max: 1,
          connect_timeout: 2,
          connection: { application_name: `${applicationName}-cancel`, statement_timeout: 1000 },
        })
      : undefined;
  if (cancellation) {
    try {
      if (options.confirmStopped) {
        const deadline = performance.now() + 2000;
        let canceled = false;
        while (true) {
          const rows = await cancellation`SELECT pid FROM pg_stat_activity WHERE application_name=${applicationName}
              AND datname=current_database() AND usename=current_user`;
          if (rows.length === 0) break;
          if (options.cancel && !canceled) {
            await cancelInvocation(cancellation, applicationName);
            canceled = true;
          }
          if (performance.now() >= deadline) throw new Error("PostgreSQL maintenance invocation did not stop");
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      } else if (options.cancel) await cancelInvocation(cancellation, applicationName);
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
    await options.client?.end({ timeout: 1 });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length) throw new AggregateError(failures, "Document PostgreSQL shutdown failed");
}

async function cancelInvocation(control: ReturnType<typeof postgres>, applicationName: string) {
  await control`SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name=${applicationName}
    AND datname=current_database() AND usename=current_user AND state='active'`;
}
