import { upgradeManagedCallbackOrigins } from "@iam/db/managed-callback-upgrade";
import { ValidatedClientSsoConfigSchema } from "@iam/domain/client/sso-configuration";
import { parseClientSsoUpgradeCommandEnv } from "@worker/env";
import postgres from "postgres";

async function main() {
  const [mode, stopped, ...flags] = process.argv.slice(2);
  if (!["inventory", "apply", "verify"].includes(mode ?? "") || stopped !== "--writers-stopped"
    || (flags.length !== 0 && (flags.length !== 2 || flags[0] !== "--migrations-schema"))) {
    throw new Error("Usage: client-managed-callback:upgrade <inventory|apply|verify> --writers-stopped [--migrations-schema <schema>]");
  }
  const { databaseUrl } = parseClientSsoUpgradeCommandEnv(process.env);
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const report = await upgradeManagedCallbackOrigins(
      sql,
      mode as "inventory" | "apply" | "verify",
      input => ValidatedClientSsoConfigSchema.parse(input),
      flags[1] ?? "drizzle",
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  finally {
    await sql.end();
  }
}

if (import.meta.main) {
  void main().catch(() => {
    console.error("Managed callback upgrade failed; keep traffic stopped, correct the source or database condition and rerun inventory.");
    process.exitCode = 1;
  });
}
