import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function createGatewayPostgresTestHarness() {
  const databaseUrl = process.env.IAM_GATEWAY_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("IAM_GATEWAY_TEST_DATABASE_URL must be supplied by the root Integration runner");
  const parsed = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    ["", "postgres", "template0", "template1"].includes(parsed.pathname.slice(1))
  )
    throw new Error("Gateway Integration requires a dedicated non-system PostgreSQL database");
  const schemaName = `iam_gateway_${randomUUID().replaceAll("-", "")}`;
  const adminSql = postgres(databaseUrl, { max: 1, onnotice() {} });
  let scopedSql: ReturnType<typeof postgres> | undefined;
  try {
    await adminSql.unsafe(`CREATE SCHEMA "${schemaName}"`);
    scopedSql = postgres(databaseUrl, {
      max: 4,
      onnotice() {},
      connection: { search_path: schemaName, application_name: schemaName },
    });
    const db = drizzle({ client: scopedSql, relations });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../../../packages/db/src/migrations", import.meta.url)),
      migrationsSchema: schemaName,
    });
    const commandUrl = new URL(databaseUrl);
    commandUrl.searchParams.set("options", `-c search_path=${schemaName}`);
    let closing: Promise<void> | undefined;
    return {
      db,
      sql: scopedSql,
      databaseUrl: commandUrl.toString(),
      close() {
        closing ??= runWithOwnedTestResources(async (lifecycle) => {
          lifecycle.registerCleanup(() => adminSql.end({ timeout: 1 }));
          lifecycle.registerCleanup(async () => {
            await adminSql.unsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
          });
          lifecycle.registerCleanup(() => scopedSql!.end({ timeout: 1 }));
        });
        return closing;
      },
    };
  } catch (error) {
    return await runWithOwnedTestResources(async (lifecycle) => {
      lifecycle.registerCleanup(() => adminSql.end({ timeout: 1 }));
      lifecycle.registerCleanup(async () => {
        await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      });
      lifecycle.registerCleanup(() => scopedSql?.end({ timeout: 1 }));
      throw error;
    });
  }
}
