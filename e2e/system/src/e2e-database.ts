import { SQL } from "bun";
import { runWithCleanup } from "./bounded-operation.ts";
import { e2eDatabaseName } from "./middleware-compose.ts";

export const e2eTemplateDatabaseName = "e2e_template";

export async function sealE2ETemplateDatabase(databaseUrl: string, signal?: AbortSignal) {
  await withMaintenanceSql(databaseUrl, signal, async (sql) => {
    await sql.unsafe(
      `CREATE DATABASE "${e2eTemplateDatabaseName}" TEMPLATE "${e2eDatabaseName}" IS_TEMPLATE true ALLOW_CONNECTIONS false`,
    );
  });
}

export async function restoreE2EDatabaseFromTemplate(databaseUrl: string, signal?: AbortSignal) {
  await withMaintenanceSql(databaseUrl, signal, async (sql) => {
    // gateway-api stays running across spec resets; release its idle read-only pool connections
    // without using DROP DATABASE ... WITH (FORCE) so any leaked backend/worker session still fails loudly.
    await sql`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${e2eDatabaseName}
        AND application_name = 'iam-gateway'
        AND state = 'idle'
    `;
    await sql.unsafe(`DROP DATABASE IF EXISTS "${e2eDatabaseName}"`);
    await sql.unsafe(`CREATE DATABASE "${e2eDatabaseName}" TEMPLATE "${e2eTemplateDatabaseName}"`);
  });
}

async function withMaintenanceSql<T>(
  databaseUrl: string,
  signal: AbortSignal | undefined,
  use: (sql: SQL) => Promise<T>,
) {
  signal?.throwIfAborted();
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = "/postgres";
  const sql = new SQL({ url: maintenanceUrl.href, max: 1, connectionTimeout: 5 });
  return await runWithCleanup(
    async () => {
      await sql.unsafe("SET statement_timeout = '40s'");
      return await use(sql);
    },
    () => sql.close({ timeout: 5 }),
  );
}
