import { ClientSsoCallbackType, ClientSsoConfigSchema, ClientSsoCustomConfigSchema } from "@iam/contracts";
import postgres from "postgres";
import { z } from "zod";

const legacyCustom = z.object(ClientSsoCustomConfigSchema.shape).omit({ callbackType: true }).strict();
const migration = new URL("../src/migrations/20260916050609_explicit_callback_type/migration.sql", import.meta.url);

function plan(clientCode: string, input: unknown) {
  if (input === null)
    return null;
  const current = ClientSsoConfigSchema.safeParse(input);
  if (current.success)
    return null;
  const old = legacyCustom.parse(input);
  const callbackType = new URL(old.callbackEndpoint).pathname === "/sso/callback"
    ? ClientSsoCallbackType.Managed
    : ClientSsoCallbackType.Business;
  const orcasDisabled = callbackType === ClientSsoCallbackType.Business && old.orcas?.enabled === true;
  const config = ClientSsoConfigSchema.parse({
    ...old,
    callbackType,
    ...(orcasDisabled ? { orcas: { enabled: false } } : {}),
  });
  return { clientCode, callbackType, orcasDisabled, config };
}

export async function upgradeClientCallbackTypes(sql: ReturnType<typeof postgres>, mode: "inventory" | "apply" | "verify") {
  const ddl = await Bun.file(migration).text();
  return await sql.begin(async (tx) => {
    await tx`LOCK TABLE client IN ACCESS EXCLUSIVE MODE`;
    const rows = await tx<{ client_code: string; sso_config: unknown }[]>`SELECT client_code, sso_config FROM client ORDER BY client_code`;
    const changes = rows.flatMap((row) => {
      const change = plan(row.client_code, row.sso_config);
      return change ? [change] : [];
    });
    if (mode === "verify" && changes.length > 0)
      throw new Error("Client callback types have not been upgraded");
    if (mode === "apply") {
      await tx`ALTER TABLE client DROP CONSTRAINT IF EXISTS client_sso_config_check`;
      for (const change of changes) {
        await tx`UPDATE client SET sso_config = ${tx.json(change.config)} WHERE client_code = ${change.clientCode}`;
      }
      await tx.unsafe(ddl);
    }
    return {
      mode,
      inspected: rows.length,
      changes: changes.map(({ config: _config, ...change }) => change),
    };
  });
}

async function main() {
  const [mode, ...flags] = process.argv.slice(2);
  if (!["inventory", "apply", "verify"].includes(mode ?? "") || flags.length !== 1 || flags[0] !== "--writers-stopped")
    throw new Error("Usage: client-callback:upgrade <inventory|apply|verify> --writers-stopped");
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const report = await upgradeClientCallbackTypes(sql, mode as "inventory" | "apply" | "verify");
    console.log(JSON.stringify(report));
  }
  finally {
    await sql.end();
  }
}

if (import.meta.main) {
  void main().catch(() => {
    console.error("Client callback upgrade failed; no success reported. Correct the source or database condition and rerun inventory.");
    process.exitCode = 1;
  });
}
