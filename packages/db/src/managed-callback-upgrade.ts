import type postgres from "postgres";
import { fileURLToPath } from "node:url";
import { ClientSsoCallbackType, ClientSsoConfigSchema, ClientSsoProtocol } from "@iam/contracts";
import { OfflineClientSsoConfigSchema } from "@iam/contracts/offline-client-sso";
import { readMigrationFiles } from "drizzle-orm/migrator";

const migration = new URL("./migrations/20260916081103_managed_callback_origin/migration.sql", import.meta.url);

function requiresConversion(input: unknown, validateConfiguration: (input: unknown) => unknown) {
  if (input === null)
    return false;
  if (ClientSsoConfigSchema.safeParse(input).success) {
    validateConfiguration(input);
    return false;
  }
  const source = OfflineClientSsoConfigSchema.parse(input);
  if (source.protocol !== ClientSsoProtocol.CustomSso || source.callbackType !== ClientSsoCallbackType.Managed)
    throw new Error("Unsupported source configuration");
  const { callbackEndpoint: _endpoint, ...target } = source;
  validateConfiguration(target);
  return true;
}

export async function upgradeManagedCallbackOrigins(
  sql: ReturnType<typeof postgres>,
  mode: "inventory" | "apply" | "verify",
  validateConfiguration: (input: unknown) => unknown,
  migrationsSchema = "drizzle",
) {
  if (!/^[a-z0-9_]+$/u.test(migrationsSchema))
    throw new Error("Invalid migration schema");
  const sourceMigrations = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) })
    .filter(candidate => candidate.name <= "20260916050609_explicit_callback_type");
  const ddl = await Bun.file(migration).text();
  return await sql.begin(async (tx) => {
    const journalTable = `"${migrationsSchema}"."__drizzle_migrations"`;
    await tx.unsafe(`LOCK TABLE ${journalTable} IN SHARE ROW EXCLUSIVE MODE`);
    await tx`LOCK TABLE client IN ACCESS EXCLUSIVE MODE`;
    const journal = await tx.unsafe<{ name: string; created_at: string }[]>(
      `SELECT name, created_at::text FROM ${journalTable}`,
    );
    for (const expected of sourceMigrations) {
      const actual = journal.filter(row => row.name === expected.name);
      if (actual.length !== 1 || actual[0]!.created_at !== String(expected.folderMillis))
        throw new Error("Current single-protocol migration journal required");
    }
    const legacyColumns = await tx`SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'client'
        AND column_name IN ('custom_sso_config','oidc_config','custom_sso_enabled','oidc_enabled')`;
    if (legacyColumns.length > 0)
      throw new Error("Current single-protocol schema required");
    const rows = await tx<{ client_code: string; sso_config: unknown }[]>`SELECT client_code, sso_config FROM client ORDER BY client_code`;
    const managedClients: string[] = [];
    const changes = rows.filter((row) => {
      const convert = requiresConversion(row.sso_config, validateConfiguration);
      const config = row.sso_config;
      if (config !== null && typeof config === "object" && "protocol" in config && "callbackType" in config
        && config.protocol === ClientSsoProtocol.CustomSso && config.callbackType === ClientSsoCallbackType.Managed) {
        managedClients.push(row.client_code);
      }
      return convert;
    }).map(row => row.client_code);
    if (mode === "verify" && changes.length > 0)
      throw new Error("Managed callbacks have not been upgraded");
    if (mode === "apply") {
      await tx`ALTER TABLE client DROP CONSTRAINT IF EXISTS client_sso_config_check`;
      for (const code of changes)
        await tx`UPDATE client SET sso_config = sso_config - 'callbackEndpoint' WHERE client_code = ${code}`;
      await tx.unsafe(ddl);
    }
    return { mode, inspected: rows.length, managedClients, changes };
  });
}
