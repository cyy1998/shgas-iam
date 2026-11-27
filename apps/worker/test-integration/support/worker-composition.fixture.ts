import { relations } from "@iam/db/relations";
import { buildLoggerOptions, LoggerSourceApp } from "@iam/runtime/logger";
import { createWorkerComposition } from "@worker/composition";
import { parseWorkerEnv } from "@worker/env";
import { drizzle } from "drizzle-orm/postgres-js";
import pino from "pino";
import postgres from "postgres";

export function parseFixtureWorkerEnv(source: NodeJS.ProcessEnv) {
  const previous = process.env.DATABASE_URL;
  try {
    return parseWorkerEnv(source);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

export async function startWorker(
  source: NodeJS.ProcessEnv,
  clock?: Parameters<typeof createWorkerComposition>[0]["clock"],
) {
  const env = parseFixtureWorkerEnv({ ...source, IAM_WORKER_HTTP_ENABLED: "false" });
  const sql = postgres(env.databaseUrl);
  const database = { db: drizzle({ client: sql, relations }), close: () => sql.end({ timeout: 2 }) };
  let output = "";
  const logger = pino(buildLoggerOptions({ nodeEnv: env.nodeEnv, logLevel: env.log.level }), {
    write(message) {
      output += message;
    },
  }).child({ sourceApp: LoggerSourceApp.Worker });
  try {
    const composition = await createWorkerComposition({ env, logger, database, clock });
    return { output: () => output, stop: () => composition.shutdown("SIGTERM") };
  } catch (error) {
    await database.close();
    throw error;
  }
}

export async function waitFor<T>(
  description: string,
  probe: () => Promise<T | undefined>,
  details?: () => string,
  timeoutMs = 10_000,
) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const result = await probe();
    if (result !== undefined) return result;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for ${description}${details ? `\n${details()}` : ""}`);
}

export async function observeWorker<T>(options: {
  label: string;
  start: () => ReturnType<typeof startWorker>;
  probe: (output: string) => Promise<T | undefined>;
  timeoutMs?: number;
  allowShutdownFailure?: boolean;
}) {
  const worker = await options.start();
  try {
    return await waitFor(options.label, () => options.probe(worker.output()), worker.output, options.timeoutMs);
  } finally {
    const stopped = worker.stop();
    if (options.allowShutdownFailure) await Promise.allSettled([stopped]);
    else await stopped;
  }
}
