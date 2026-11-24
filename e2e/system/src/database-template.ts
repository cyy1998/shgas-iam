import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SQL } from "bun";
import Redis from "ioredis";
import { pnpmCommand, runOwnedCommand } from "../../../scripts/test-resources/owned-command.mjs";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import { runWithCleanup } from "./bounded-operation.ts";
import { e2eDatabaseName } from "./hybrid-compose.ts";
import { assertActiveHybridMiddleware, type HybridMiddleware } from "./hybrid-middleware.ts";
import { readTemplateSeedReceipt } from "./seed-receipt.ts";
import {
  fingerprintTemplateInputs,
  obsoleteTemplateDatabases,
  readTemplateSourceFingerprint,
  templateDatabaseName,
} from "./template-fingerprint.ts";

interface TemplateOptions {
  repositoryRoot: string;
  artifactDirectory: string;
  middleware: HybridMiddleware;
  canonicalOrigin: string;
  internalOrigin?: string;
  adminPassword: string;
  sourceFingerprint?: string;
  signal?: AbortSignal;
}

const busyStacks = new WeakSet<HybridMiddleware>();

export async function prepareE2EDatabaseTemplate(options: TemplateOptions) {
  return await useTemplateDatabase(options, async (sql) => {
    const { repositoryRoot, canonicalOrigin, internalOrigin = canonicalOrigin, adminPassword, middleware } = options;
    const sources = options.sourceFingerprint ?? (await readTemplateSourceFingerprint(repositoryRoot));
    const digest = fingerprintTemplateInputs([
      { path: "sources", content: sources },
      { path: "seed-environment", content: JSON.stringify([canonicalOrigin, internalOrigin, adminPassword]) },
    ]);
    const name = templateDatabaseName(digest);
    const seedIdentity = { runId: `tpl-${digest.slice(-18)}`, canonicalOrigin, internalOrigin };
    const receiptPath = join(options.artifactDirectory, `seed-${digest}.json`);
    await mkdir(options.artifactDirectory, { recursive: true });
    const seedEnv = {
      ...middleware.hostEnvironment,
      DATABASE_URL: middleware.databaseUrl,
      IAM_E2E_REDIS_URL: middleware.redisUrl,
      IAM_E2E_RUN_ID: seedIdentity.runId,
      IAM_E2E_ORIGIN: canonicalOrigin,
      IAM_E2E_INTERNAL_ORIGIN: internalOrigin,
      IAM_E2E_ADMIN_PASSWORD: adminPassword,
      IAM_E2E_SEED_RECEIPT_PATH: receiptPath,
    };

    const template = await readTemplate(sql, name);
    let receipt = template?.connectable === false ? template.receipt : null;
    if (receipt === null) {
      // An interrupted build can leave an unmarked template. It is never used for a reset.
      if (template) await sql.unsafe(`DROP DATABASE "${name}"`);
      await recreateBusinessDatabase(sql, "template0");
      await runMigrations(options);
      options.signal?.throwIfAborted();
      await clearSeedRedis(middleware.redisUrl);
      await seedWithWorker(options, seedEnv);
      receipt = await readFile(receiptPath, "utf8");
      readTemplateSeedReceipt(receipt, seedIdentity);
      options.signal?.throwIfAborted();
      await sql.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${e2eDatabaseName}" ALLOW_CONNECTIONS false`);
      // COMMENT is a utility statement and does not accept parameters. PostgreSQL standard
      // string literals are enabled on this connection before issuing interpolated DDL.
      await sql.unsafe(`COMMENT ON DATABASE "${name}" IS '${receipt.replaceAll("'", "''")}'`);
    }

    const references = readTemplateSeedReceipt(receipt, seedIdentity);
    const databases: { datname: string }[] = await sql`SELECT datname FROM pg_database`;
    for (const obsolete of obsoleteTemplateDatabases(
      databases.map((database) => database.datname),
      name,
    )) {
      options.signal?.throwIfAborted();
      await sql.unsafe(`DROP DATABASE "${obsolete}"`);
    }

    return {
      name,
      references,
      async reset(signal?: AbortSignal) {
        await useTemplateDatabase({ ...options, signal: signal ?? options.signal }, async (control) => {
          const current = await readTemplate(control, name);
          if (current?.connectable !== false || current.receipt !== receipt) {
            throw new Error(`E2E template ${name} changed; prepare the current baseline before resetting`);
          }
          await recreateBusinessDatabase(control, name);
          await writeAtomicJsonFile(receiptPath, JSON.parse(receipt));
          await runSeedCommand(options, seedEnv, "restore", signal ?? options.signal);
        });
        return references;
      },
    };
  });
}

async function useTemplateDatabase<T>(options: TemplateOptions, use: (sql: SQL) => Promise<T>) {
  const middleware = options.middleware;
  assertActiveHybridMiddleware(middleware);
  options.signal?.throwIfAborted();
  if (busyStacks.has(middleware)) throw new Error("An E2E database template operation is already running");
  busyStacks.add(middleware);
  try {
    const maintenanceUrl = new URL(middleware.databaseUrl);
    maintenanceUrl.pathname = "/postgres";
    const sql = new SQL({ url: maintenanceUrl.href, max: 1, connectionTimeout: 5 });
    return await runWithCleanup(
      async () => {
        await sql.unsafe("SET statement_timeout = '40s'");
        await sql.unsafe("SET standard_conforming_strings = on");
        return await use(sql);
      },
      () => sql.close({ timeout: 5 }),
    );
  } finally {
    busyStacks.delete(middleware);
  }
}

async function readTemplate(sql: SQL, name: string) {
  const rows: { receipt: string | null; connectable: boolean }[] = await sql`
    SELECT shobj_description(oid, 'pg_database') AS receipt, datallowconn AS connectable
    FROM pg_database
    WHERE datname = ${name}
  `;
  return rows[0];
}

async function recreateBusinessDatabase(sql: SQL, source: string) {
  // Without FORCE, a surviving app/worker connection fails the reset before Redis changes.
  await sql.unsafe(`DROP DATABASE IF EXISTS "${e2eDatabaseName}"`);
  await sql.unsafe(`CREATE DATABASE "${e2eDatabaseName}" TEMPLATE "${source}"`);
}

async function clearSeedRedis(url: string) {
  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.flushdb();
  } finally {
    redis.disconnect(false);
  }
}

async function runMigrations(options: TemplateOptions) {
  const result = await runOwnedCommand({
    ...pnpmCommand(process.env.npm_execpath ?? "pnpm", ["--filter", "@iam/db", "db:migrate"]),
    cwd: options.repositoryRoot,
    env: { ...options.middleware.hostEnvironment, DATABASE_URL: options.middleware.databaseUrl },
    signal: options.signal,
    timeoutMs: 60_000,
    logFile: join(options.artifactDirectory, "template-migration.log"),
  });
  if (result.exitCode !== 0) throw new Error(`E2E template migration failed:\n${result.output}`);
}

async function seedWithWorker(options: TemplateOptions, seedEnv: NodeJS.ProcessEnv) {
  const stop = new AbortController();
  const stoppedEarly = new AbortController();
  const normalStop = new Error("E2E template seed settled");
  const worker = runOwnedCommand({
    executable: process.execPath,
    args: ["src/index.ts"],
    cwd: join(options.repositoryRoot, "apps/worker"),
    env: {
      ...options.middleware.hostEnvironment,
      NODE_ENV: "development",
      IAM_WORKER_DATABASE_URL: options.middleware.databaseUrl,
      IAM_WORKER_REDIS_URL: options.middleware.redisUrl,
      IAM_WORKER_ENABLED_MODULES: "user-document",
      IAM_WORKER_HTTP_ENABLED: "false",
      IAM_WORKER_BULL_BOARD_ENABLED: "false",
      IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "false",
    },
    signal: stop.signal,
    cleanupTimeoutMs: 5_000,
    logFile: join(options.artifactDirectory, "template-worker.log"),
  })
    .then(({ exitCode }) => new Error(`E2E template Worker exited early with code ${exitCode}`))
    .catch((error: unknown) => (error === normalStop ? undefined : error))
    .then((failure) => {
      if (failure !== undefined) stoppedEarly.abort(failure);
      return failure;
    });

  const seedSignal = options.signal ? AbortSignal.any([options.signal, stoppedEarly.signal]) : stoppedEarly.signal;
  await runWithCleanup(
    () => runSeedCommand(options, seedEnv, "template", seedSignal),
    async () => {
      stop.abort(normalStop);
      const failure = await worker;
      if (failure !== undefined) throw failure;
    },
  );
}

async function runSeedCommand(
  options: TemplateOptions,
  env: NodeJS.ProcessEnv,
  mode: "template" | "restore",
  signal?: AbortSignal,
) {
  const result = await runOwnedCommand({
    executable: process.execPath,
    args: ["src/seed-cli.ts", mode],
    cwd: join(options.repositoryRoot, "e2e/system"),
    env,
    signal,
    timeoutMs: 50_000,
    logFile: join(options.artifactDirectory, mode === "template" ? "template-seed.log" : "template-restore.log"),
  });
  if (result.exitCode !== 0) {
    throw new Error(`E2E template ${mode === "template" ? "seed" : "Redis restore"} failed:\n${result.output}`);
  }
}
