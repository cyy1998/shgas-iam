import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createOfflineMaintenanceRedis } from "@worker/composition/offline-maintenance-redis";
import { parseClientSsoUpgradeCommandEnv, parseOfflineMaintenanceEnv } from "@worker/env";
import postgres from "postgres";
import { runUpgradeCommand } from "./command";
import { postgresBaseline, redisBaseline, verifyPreservation } from "./preservation";
import { completeRecovery, digest, prepareRecoveryDirectory, readJson, readOptionalJson, recoverySchema, writeEvidence } from "./recovery";
import { B648SourceError, inspectB648Clients } from "./source";
import { B648_SOURCE, CLIENT_CALLBACK_TYPE, CLIENT_SSO_EXPANSION, inspectMigrationPrefix, MANAGED_CALLBACK_ORIGIN, migrationJournal } from "./staged-migrations";
import { readClientUpgradeRows } from "./upgrade";
import { ClientSsoUpgradeManifestSchema, planClientSsoUpgrade, readLegacyClient } from "./upgrade-plan";

let phase = "preflight";

function validateAutomaticSource(row: Record<string, unknown>) {
  const source = readLegacyClient(row);
  if (source.oidc && source.custom)
    throw new Error("Ambiguous Client protocol");
  planClientSsoUpgrade(row, { clientCode: source.row.client_code, credentialId: randomUUID(), sourceDigest: "0".repeat(64) });
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: {
    "state-dir": { type: "string" },
    "migrations-schema": { type: "string", default: "drizzle" },
  } });
  const schema = values["migrations-schema"]!;
  migrationJournal(schema);
  const directory = resolve(values["state-dir"] ?? fileURLToPath(new URL("../../.b648-upgrade/", import.meta.url)));
  const statePath = join(directory, "state.json");
  const manifestPath = join(directory, "manifest.json");
  const receiptPath = join(directory, "receipt.json");
  const { databaseUrl } = parseClientSsoUpgradeCommandEnv(process.env);
  const env = { ...process.env, DATABASE_URL: databaseUrl, IAM_WORKER_REDIS_PORT: process.env.IAM_WORKER_REDIS_PORT ?? "6379", IAM_WORKER_REDIS_DB: process.env.IAM_WORKER_REDIS_DB ?? "0" };
  const redisConfig = parseOfflineMaintenanceEnv(env);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 30 * 60_000);
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  const connection = createOfflineMaintenanceRedis(redisConfig, controller.signal);
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {}, connect_timeout: 5, connection: { application_name: "iam-b648-unattended", statement_timeout: 300_000, lock_timeout: 10_000 } });
  try {
    const [identity] = await sql`SELECT current_database() AS database, current_schema() AS schema,
      'client'::regclass::oid::text AS client_oid, pg_backend_pid() AS pid`;
    const pgUrl = new URL(databaseUrl);
    const resource = digest(JSON.stringify({ host: pgUrl.hostname, port: pgUrl.port || "5432", database: identity!.database, schema: identity!.schema, clientOid: identity!.client_oid, journal: schema, redis: { host: redisConfig.host, port: redisConfig.port, db: redisConfig.db } }));
    // A database-scoped session lock also excludes a second invocation using another local directory.
    const [lock] = await sql`SELECT pg_try_advisory_lock(hashtext('iam-b648-unattended'), hashtext(current_schema())) AS acquired`;
    if (!lock!.acquired)
      throw new Error("Upgrade already running");
    async function checkConnection() {
      controller.signal.throwIfAborted();
      const [current] = await sql`SELECT pg_backend_pid() AS pid`;
      if (current!.pid !== identity!.pid)
        throw new Error("Upgrade lock connection changed");
    }
    async function command(name: string, script: string, args: string[]) {
      await checkConnection();
      phase = name;
      const report = await runUpgradeCommand(script, args, env, controller.signal);
      process.stdout.write(`${JSON.stringify({ version: 1, phase, status: "phase-completed" })}\n`);
      return report;
    }
    async function stage(mode: string) {
      const needsReceipt = ["contract", "finalize", "verify-final"].includes(mode);
      const needsManifest = needsReceipt || ["apply", "verify"].includes(mode);
      return await command(mode, "scripts/b648-upgrade/index.ts", [mode, "--writers-stopped", "--migrations-schema", schema, ...(needsManifest ? ["--manifest", manifestPath] : []), ...(needsReceipt ? ["--receipt", receiptPath] : [])]);
    }
    async function online(layout: "source" | "unified", mode: string) {
      return await command(`${layout}-${mode}`, "src/commands/online-state/online-state.ts", [mode, "--layout", layout, "--owner", "all", "--kernel-namespace", layout === "source" ? "sess:v2:" : "iam:session", ...(layout === "unified" ? ["--custom-namespace", "iam:session", "--oidc-namespace", "iam:oidc"] : []), "--writers-stopped", "--drained"]);
    }
    const currentStage = () => sql.begin("READ ONLY", tx => inspectMigrationPrefix(tx, schema));
    let current = await currentStage();
    let saved = await readOptionalJson(statePath);
    if (saved === undefined) {
      if (current !== B648_SOURCE || await readOptionalJson(receiptPath) !== undefined)
        throw new Error("Missing recovery evidence");
      const manifest = await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
        await inspectB648Clients(tx, schema, validateAutomaticSource);
        const rows = await readClientUpgradeRows(tx);
        return ClientSsoUpgradeManifestSchema.parse({ version: 1, layout: "dual-to-single-v1", clients: rows.map(row => ({
          clientCode: readLegacyClient(row.data).row.client_code,
          credentialId: randomUUID(),
          sourceDigest: digest(row.preserved),
        })) });
      });
      await connection.connect();
      await online("source", "inventory");
      await online("unified", "inventory");
      saved = recoverySchema.parse({ version: 1, source: "b6481f2de5c2930fc381d99e70520e0783091e9d", target: "acc2bd7c558ce9b029bcb04d446a31ee6dbeca25", resource, manifest, baseline: { postgres: await postgresBaseline(sql), redis: await redisBaseline(connection.redis, controller.signal) } });
      await prepareRecoveryDirectory(directory);
      await writeEvidence(statePath, saved);
    }
    const state = recoverySchema.parse(saved);
    if (state.resource !== resource)
      throw new Error("Recovery resource mismatch");
    if (state.completion !== undefined) {
      if (state.completion.receiptDigest !== digest(JSON.stringify(await readJson(receiptPath))))
        throw new Error("Completion evidence mismatch");
      // Never repair missing artifacts or touch Redis on a completed invocation.
      if (JSON.stringify(await readJson(manifestPath)) !== JSON.stringify(state.manifest))
        throw new Error("Manifest evidence mismatch");
      await stage("verify-final");
      process.stdout.write(`${JSON.stringify({ version: 1, status: "completed", alreadyCompleted: true })}\n`);
      return;
    }
    if (connection.redis.status !== "ready")
      await connection.connect();
    await prepareRecoveryDirectory(directory);
    await writeEvidence(manifestPath, state.manifest);
    phase = "preservation-preflight";
    await verifyPreservation(sql, connection.redis, state.baseline, controller.signal);
    if (current === B648_SOURCE || current === CLIENT_SSO_EXPANSION) {
      await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
        await inspectB648Clients(tx, schema, validateAutomaticSource, current === CLIENT_SSO_EXPANSION);
        const rows = await readClientUpgradeRows(tx);
        if (rows.length !== state.manifest.clients.length || rows.some(row =>
          !state.manifest.clients.some(client => client.clientCode === row.data.client_code && client.sourceDigest === digest(row.preserved)))) {
          throw new Error("Original source facts changed");
        }
      });
    }
    await online("source", "inventory");
    await online("unified", "inventory");
    if (current === B648_SOURCE) {
      await stage("expand");
      current = await currentStage();
    }
    if (current === CLIENT_SSO_EXPANSION) {
      await stage("prepare");
      await stage("apply");
      await stage("verify");
      await stage("contract");
      current = await currentStage();
    }
    if (current === CLIENT_CALLBACK_TYPE) {
      await stage("finalize");
      current = await currentStage();
    }
    if (current !== MANAGED_CALLBACK_ORIGIN)
      throw new Error("Unsupported recovery stage");
    await stage("verify-final");
    for (const layout of ["source", "unified"] as const) {
      await online(layout, "apply");
      await online(layout, "verify");
    }
    for (const mode of ["repair", "verify"])
      await command(`snapshot-${mode}`, "src/commands/client-runtime/client-snapshot-maintenance.ts", [mode, "--all", "--writers-stopped", "--drained"]);
    phase = "preservation-final";
    const preservation = await verifyPreservation(sql, connection.redis, state.baseline, controller.signal);
    await checkConnection();
    await completeRecovery(statePath, state, { receiptDigest: digest(JSON.stringify(await readJson(receiptPath))), preservation });
    process.stdout.write(`${JSON.stringify({ version: 1, status: "completed", alreadyCompleted: false, preservation })}\n`);
  }
  finally {
    clearTimeout(timer);
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
    connection.close();
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({ version: 1, status: "failed", phase, reason: error instanceof B648SourceError ? error.reason : "b648-upgrade-failed", ...(error instanceof B648SourceError ? { clients: error.clients } : {}) }));
  process.exitCode = 1;
});
