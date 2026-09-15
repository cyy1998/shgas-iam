import { readFile, stat } from "node:fs/promises";
import process from "node:process";
import { parseClientSsoUpgradeCommandEnv } from "@worker/env";
import postgres from "postgres";
import { runClientSsoUpgrade } from "./upgrade";
import { ClientSsoUpgradeManifestSchema } from "./upgrade-plan";

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const mode = args.shift();
  const writersStopped = args.shift() === "--writers-stopped";
  const all = args.at(-1) === "--all";
  if (all)
    args.pop();
  if (!writersStopped || !["inventory", "apply", "verify"].includes(mode ?? "")
    || (mode === "inventory" ? args.length !== 0 || all : args.length !== 2 || args[0] !== "--manifest" || !args[1])
    || (mode === "apply" && all)) {
    process.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "invalid-arguments" })}\n`);
    process.exitCode = 2;
    return;
  }
  let manifest;
  if (mode !== "inventory") {
    const path = args[1]!;
    if ((await stat(path)).size > 1024 * 1024)
      throw new Error("Manifest too large");
    manifest = ClientSsoUpgradeManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (manifest.clients.length === 0 && !(mode === "verify" && all))
      throw new Error("Explicit nonempty scope required");
  }
  const { databaseUrl } = parseClientSsoUpgradeCommandEnv(process.env);
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
    connection: {
      application_name: "iam-client-sso-upgrade-v1",
      statement_timeout: 300_000,
      lock_timeout: 10_000,
      idle_in_transaction_session_timeout: 300_000,
    },
  });
  let report;
  try {
    report = await runClientSsoUpgrade(sql, { mode: mode as "inventory" | "apply" | "verify", manifest, all });
  }
  finally {
    await sql.end({ timeout: 5 });
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.status === "completed" ? 0 : 1;
}

if (import.meta.main) {
  try {
    // eslint-disable-next-line antfu/no-top-level-await -- Complete transaction and shutdown before reporting success.
    await main();
  }
  catch {
    process.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "operation-failed" })}\n`);
    process.exitCode = 1;
  }
}
