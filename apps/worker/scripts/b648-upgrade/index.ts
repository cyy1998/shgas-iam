import { createHash, randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ClientSsoProtocol } from "@iam/contracts";
import { upgradeManagedCallbackOrigins } from "@iam/db/managed-callback-upgrade";
import { ValidatedClientSsoConfigSchema } from "@iam/domain/client/sso-configuration";
import postgres from "postgres";
import { z } from "zod";
import { B648SourceError, clientUpgradeFingerprints, inspectB648Clients, prepareB648CallbackCheck } from "./source";
import { B648_SOURCE, CLIENT_CALLBACK_TYPE, CLIENT_SSO_EXPANSION, inspectMigrationPrefix, MANAGED_CALLBACK_ORIGIN, migrateThrough, migrationJournal } from "./staged-migrations";
import { runClientSsoUpgradeInTransaction } from "./upgrade";
import { ClientSsoUpgradeManifestSchema, planClientSsoUpgrade, readLegacyClient } from "./upgrade-plan";

const ReceiptSchema = z.object({
  version: z.literal(1),
  source: z.literal("b6481f2de5c2930fc381d99e70520e0783091e9d"),
  manifestDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  clients: z.array(z.object({ clientCode: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/u) }).strict()).max(1000),
}).strict();

function validateSource(row: Record<string, unknown>) {
  const source = readLegacyClient(row);
  for (const protocol of [source.oidc ? ClientSsoProtocol.Oidc : undefined, source.custom ? ClientSsoProtocol.CustomSso : undefined]) {
    if (protocol)
      planClientSsoUpgrade(row, { clientCode: source.row.client_code, sourceDigest: "0".repeat(64), credentialId: randomUUID(), protocol });
  }
}

async function readBounded(path: string) {
  if ((await stat(path)).size > 1024 * 1024)
    throw new Error("File exceeds 1 MiB");
  return JSON.parse(await readFile(path, "utf8"));
}

async function verifyInNewProcess(manifest: string, schema: string, manifestDigest: string) {
  const child = Bun.spawn([process.execPath, "--no-env-file", fileURLToPath(new URL("./index.ts", import.meta.url)), "verify", "--writers-stopped", "--manifest", manifest, "--migrations-schema", schema, "--manifest-digest", manifestDigest], {
    env: process.env,
    stdout: "ignore",
    stderr: "ignore",
  });
  const timeout = setTimeout(() => child.kill(), 60_000);
  try {
    if (await child.exited !== 0)
      throw new Error("Independent full verification failed");
  }
  finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const [mode, stopped, ...flags] = process.argv.slice(2).filter(arg => arg !== "--");
  if (!mode || !["preflight", "expand", "prepare", "inventory", "apply", "verify", "contract", "finalize", "verify-final"].includes(mode) || stopped !== "--writers-stopped")
    throw new Error("Invalid arguments");
  const options = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index]!;
    const value = flags[index + 1];
    if (!["--migrations-schema", "--manifest", "--receipt", "--manifest-digest"].includes(flag) || !value || options.has(flag))
      throw new Error("Invalid arguments");
    options.set(flag, value);
  }
  const schema = options.get("--migrations-schema") ?? "drizzle";
  const manifestPath = options.get("--manifest");
  const receiptPath = options.get("--receipt");
  const expectedManifestDigest = options.get("--manifest-digest");
  if (expectedManifestDigest && (mode !== "verify" || !/^[a-f0-9]{64}$/u.test(expectedManifestDigest)))
    throw new Error("Invalid verification digest");
  const needsReceipt = ["contract", "finalize", "verify-final"].includes(mode);
  const needsManifest = needsReceipt || ["apply", "verify"].includes(mode);
  if (needsManifest !== !!manifestPath || needsReceipt !== !!receiptPath)
    throw new Error("Explicit manifest and receipt required only for contraction/final verification");
  const databaseUrl = z.url({ protocol: /^postgres(?:ql)?$/u }).parse(process.env.DATABASE_URL);
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {}, connection: {
    application_name: "iam-b648-client-upgrade",
    statement_timeout: 300_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 300_000,
  } });
  let report: unknown;
  try {
    if (mode === "inventory" || mode === "apply" || mode === "verify") {
      const manifest = manifestPath ? ClientSsoUpgradeManifestSchema.parse(await readBounded(manifestPath)) : undefined;
      if (expectedManifestDigest && createHash("sha256").update(JSON.stringify(manifest)).digest("hex") !== expectedManifestDigest)
        throw new Error("Manifest changed before independent verification");
      const result = await sql.begin(mode === "apply" ? "" : "ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
        if (mode === "apply")
          await tx`LOCK TABLE client, role IN SHARE ROW EXCLUSIVE MODE`;
        await inspectB648Clients(tx, schema, validateSource, true);
        return await runClientSsoUpgradeInTransaction(tx, { mode, all: true, manifest });
      });
      report = result;
      if (result.status !== "completed")
        process.exitCode = 1;
    }
    else if (mode === "expand") {
      report = await migrateThrough(sql, { through: CLIENT_SSO_EXPANSION, migrationsSchema: schema, beforeMigrations: async (tx, current) => {
        if (current !== B648_SOURCE && current !== CLIENT_SSO_EXPANSION)
          throw new Error("Unsupported b648 stage");
        await tx`LOCK TABLE client, role IN SHARE ROW EXCLUSIVE MODE`;
        await inspectB648Clients(tx, schema, validateSource, current === CLIENT_SSO_EXPANSION);
      } });
    }
    else if (mode === "preflight" || mode === "prepare") {
      report = await sql.begin(async (tx) => {
        await tx.unsafe(`LOCK TABLE ${migrationJournal(schema)} IN SHARE ROW EXCLUSIVE MODE`);
        await tx`LOCK TABLE client, role IN SHARE ROW EXCLUSIVE MODE`;
        const result = await inspectB648Clients(tx, schema, validateSource, mode === "prepare");
        if (mode === "prepare")
          await prepareB648CallbackCheck(tx);
        return result;
      });
    }
    else {
      const manifest = ClientSsoUpgradeManifestSchema.parse(await readBounded(manifestPath!));
      const manifestDigest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
      if (mode === "contract") {
        report = await migrateThrough(sql, { through: CLIENT_CALLBACK_TYPE, migrationsSchema: schema, beforeMigrations: async (tx, current) => {
          if (current !== CLIENT_SSO_EXPANSION && current !== CLIENT_CALLBACK_TYPE)
            throw new Error("Unsupported contraction stage");
          await tx`LOCK TABLE client, role IN SHARE ROW EXCLUSIVE MODE`;
          if (current === CLIENT_CALLBACK_TYPE) {
            const receipt = ReceiptSchema.parse(await readBounded(receiptPath!));
            if (receipt.manifestDigest !== manifestDigest || JSON.stringify(receipt.clients) !== JSON.stringify(await clientUpgradeFingerprints(tx)))
              throw new Error("Contraction receipt mismatch");
          }
        }, verifyContraction: async (tx) => {
          await inspectB648Clients(tx, schema, validateSource, true);
          // Parent locks freeze the journal, Clients and Roles while a separate process reads committed facts.
          await verifyInNewProcess(manifestPath!, schema, manifestDigest);
          const receipt = ReceiptSchema.parse({ version: 1, source: "b6481f2de5c2930fc381d99e70520e0783091e9d", manifestDigest, clients: await clientUpgradeFingerprints(tx) });
          try {
            await writeFile(receiptPath!, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
          }
          catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "EEXIST")
              || JSON.stringify(ReceiptSchema.parse(await readBounded(receiptPath!))) !== JSON.stringify(receipt)) {
              throw new Error("Receipt conflict");
            }
          }
        } });
      }
      else {
        if (mode === "finalize") {
          await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
            const current = await inspectMigrationPrefix(tx, schema);
            if (current !== CLIENT_CALLBACK_TYPE && current !== MANAGED_CALLBACK_ORIGIN)
              throw new Error("Unsupported finalization stage");
            const receipt = ReceiptSchema.parse(await readBounded(receiptPath!));
            if (receipt.manifestDigest !== manifestDigest || JSON.stringify(receipt.clients) !== JSON.stringify(await clientUpgradeFingerprints(tx)))
              throw new Error("Finalization receipt mismatch");
          });
          await upgradeManagedCallbackOrigins(sql, "apply", value => ValidatedClientSsoConfigSchema.parse(value), schema);
          await migrateThrough(sql, { through: MANAGED_CALLBACK_ORIGIN, migrationsSchema: schema });
          await upgradeManagedCallbackOrigins(sql, "verify", value => ValidatedClientSsoConfigSchema.parse(value), schema);
        }
        report = await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
          await inspectMigrationPrefix(tx, schema, MANAGED_CALLBACK_ORIGIN);
          const receipt = ReceiptSchema.parse(await readBounded(receiptPath!));
          const fingerprints = await clientUpgradeFingerprints(tx);
          if (receipt.manifestDigest !== manifestDigest || JSON.stringify(receipt.clients) !== JSON.stringify(fingerprints))
            throw new Error("Final retained facts mismatch");
          const rows = await tx<{ sso_config: unknown }[]>`SELECT sso_config FROM client`;
          for (const row of rows) {
            if (row.sso_config !== null)
              ValidatedClientSsoConfigSchema.parse(row.sso_config);
          }
          return { inspected: rows.length };
        });
      }
    }
    process.stdout.write(`${JSON.stringify({ version: 1, status: process.exitCode ? "failed" : "completed", mode, report })}\n`);
  }
  finally {
    await sql.end({ timeout: 5 });
  }
}
void main().catch((error) => {
  console.error(JSON.stringify({ version: 1, status: "failed", reason: error instanceof B648SourceError ? error.reason : "b648-stage-failed", ...(error instanceof B648SourceError ? { clients: error.clients } : {}) }));
  process.exitCode = 1;
});
