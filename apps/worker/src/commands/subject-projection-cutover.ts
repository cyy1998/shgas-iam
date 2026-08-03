import type { SubjectProjectionCutoverManifest } from "./subject-projection-cutover.manifest";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { SubjectProjectionCutoverManifestSchema } from "./subject-projection-cutover.manifest";

interface GeneratedSecret {
  clientCode: string;
  secret: string;
}

export interface SubjectProjectionBackfillCommandDeps {
  clients: {
    applyManifest: (
      manifest: SubjectProjectionCutoverManifest,
      options: {
        deliverGeneratedSecrets: (secrets: GeneratedSecret[]) => Promise<void>;
      },
    ) => Promise<{
      generatedSecrets: GeneratedSecret[];
      blockers: Array<{ clientCode: string; reason: string }>;
    }>;
  };
  backfill: {
    backfillBatch: (input: {
      version: 1;
      afterUserId: number;
      batchSize: number;
    }) => Promise<{
      nextAfterUserId: number;
      complete: boolean;
      scanned: number;
      rebuilt: number;
      reused: number;
      facts: { published: number; retainedNewer: number };
      barriers: { seeded: number; retainedExisting: number };
    }>;
  };
  secretDelivery: {
    writeOnce: (secrets: GeneratedSecret[]) => Promise<void>;
  };
  logger: {
    info: (data: Record<string, unknown>, message: string) => void;
    error: (data: Record<string, unknown>, message: string) => void;
  };
}

export async function runSubjectProjectionBackfillCommand(
  deps: SubjectProjectionBackfillCommandDeps,
  options: {
    manifest: SubjectProjectionCutoverManifest;
    batchSize: number;
    afterUserId: number;
  },
) {
  requirePositiveSafeInteger(options.batchSize, "batchSize");
  requireNonNegativeSafeInteger(options.afterUserId, "afterUserId");
  const clientResult = await deps.clients.applyManifest(options.manifest, {
    deliverGeneratedSecrets: deps.secretDelivery.writeOnce,
  }).catch((error) => {
    deps.logger.error({
      version: options.manifest.version,
      cutoverId: options.manifest.cutoverId,
      safeAfterUserId: options.afterUserId,
    }, "Subject Projection client manifest failed");
    throw error;
  });
  deps.logger.info({
    version: options.manifest.version,
    cutoverId: options.manifest.cutoverId,
    configuredClients: options.manifest.clients.length,
    generatedSecretClientCodes: clientResult.generatedSecrets.map(secret => secret.clientCode),
    blockerClientCodes: clientResult.blockers.map(blocker => blocker.clientCode),
  }, "Subject Projection client manifest applied");

  const startAfterUserId = options.afterUserId;
  let safeAfterUserId = startAfterUserId;
  let batches = 0;
  let scanned = 0;
  let rebuilt = 0;
  let reused = 0;
  while (true) {
    batches += 1;
    let result;
    try {
      result = await deps.backfill.backfillBatch({
        version: options.manifest.version,
        afterUserId: safeAfterUserId,
        batchSize: options.batchSize,
      });
    }
    catch (error) {
      deps.logger.error({
        version: options.manifest.version,
        batch: batches,
        safeAfterUserId,
      }, "Subject Projection cutover batch failed");
      throw error;
    }
    scanned += result.scanned;
    rebuilt += result.rebuilt;
    reused += result.reused;
    safeAfterUserId = result.nextAfterUserId;
    deps.logger.info({
      version: options.manifest.version,
      cutoverId: options.manifest.cutoverId,
      batch: batches,
      nextAfterUserId: safeAfterUserId,
      complete: result.complete,
      scanned: result.scanned,
      rebuilt: result.rebuilt,
      reused: result.reused,
      factsPublished: result.facts.published,
      factsRetainedNewer: result.facts.retainedNewer,
      barriersSeeded: result.barriers.seeded,
      barriersRetainedExisting: result.barriers.retainedExisting,
    }, "Subject Projection cutover batch completed");
    if (result.complete)
      break;
  }

  return {
    version: options.manifest.version,
    cutoverId: options.manifest.cutoverId,
    startAfterUserId,
    nextAfterUserId: safeAfterUserId,
    batches,
    scanned,
    rebuilt,
    reused,
    generatedSecretClientCodes: clientResult.generatedSecrets.map(secret => secret.clientCode),
    blockers: clientResult.blockers,
  };
}

export async function runSubjectProjectionVerifyCommand(
  deps: {
    verifier: {
      verify: (input: {
        version: 1;
        batchSize: number;
        manifest: SubjectProjectionCutoverManifest;
      }) => Promise<{
        version: 1;
        cutoverId: string;
        verifiedAt: string;
        status: "failed" | "passed";
        counts: { users: number; profiles: number; verifiedUsers: number };
        failures: Array<{ code: string; count: number; samples: string[] }>;
      }>;
    };
    logger: {
      info: (data: Record<string, unknown>, message: string) => void;
    };
  },
  options: {
    manifest: SubjectProjectionCutoverManifest;
    batchSize: number;
  },
) {
  requirePositiveSafeInteger(options.batchSize, "batchSize");
  deps.logger.info({
    version: options.manifest.version,
    cutoverId: options.manifest.cutoverId,
    batchSize: options.batchSize,
  }, "Subject Projection cutover verification started");
  const report = await deps.verifier.verify({
    version: options.manifest.version,
    batchSize: options.batchSize,
    manifest: options.manifest,
  });
  deps.logger.info(report, "Subject Projection cutover verification completed");
  return report;
}

export function createSecretFileDelivery(input: {
  outputPath: string | undefined;
  manifest: SubjectProjectionCutoverManifest;
  clock: { nowDate: () => Date };
}) {
  let written = false;
  return {
    async writeOnce(secrets: GeneratedSecret[]) {
      if (secrets.length === 0)
        return;
      if (written)
        throw new Error("Subject Projection secret output has already been written");
      if (input.outputPath === undefined) {
        throw new Error(
          "--secret-output is required when the manifest creates an Independent client secret",
        );
      }
      await writeFile(input.outputPath, `${JSON.stringify({
        version: 1,
        cutoverId: input.manifest.cutoverId,
        generatedAt: input.clock.nowDate().toISOString(),
        secrets,
      }, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      written = true;
    },
  };
}

interface CutoverCliOptions {
  operation: "backfill" | "verify";
  manifestPath: string;
  secretOutputPath?: string;
  batchSize?: number;
  afterUserId: number;
}

function parseCutoverArgs(argv: string[]): CutoverCliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "manifest": { type: "string" },
      "secret-output": { type: "string" },
      "batch-size": { type: "string" },
      "after-user-id": { type: "string", default: "0" },
    },
    strict: true,
  });
  const operation = positionals[0];
  if (operation !== "backfill" && operation !== "verify")
    throw new Error("Subject Projection cutover operation must be backfill or verify");
  if (positionals.length !== 1)
    throw new Error("Subject Projection cutover accepts exactly one operation");
  if (values.manifest === undefined)
    throw new Error("--manifest is required");
  return {
    operation,
    manifestPath: values.manifest,
    secretOutputPath: values["secret-output"],
    batchSize: values["batch-size"] === undefined
      ? undefined
      : Number(values["batch-size"]),
    afterUserId: Number(values["after-user-id"]),
  };
}

async function main() {
  const options = parseCutoverArgs(process.argv.slice(2));
  const manifest = SubjectProjectionCutoverManifestSchema.parse(
    JSON.parse(await Bun.file(options.manifestPath).text()),
  );
  const { parseWorkerEnv } = await import("@worker/env");
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const { createWorkerCommandComposition } = await import("@worker/composition");
  const composition = await createWorkerCommandComposition({ env, logger });
  const batchSize = options.batchSize ?? env.userProfile.backfillBatchSize;
  try {
    if (options.operation === "backfill") {
      await runSubjectProjectionBackfillCommand({
        clients: composition.subjectProjectionCutover.clients,
        backfill: composition.userProfile.cutoverBackfill,
        secretDelivery: createSecretFileDelivery({
          outputPath: options.secretOutputPath,
          manifest,
          clock: composition.runtime.clock,
        }),
        logger: composition.logger,
      }, {
        manifest,
        batchSize,
        afterUserId: options.afterUserId,
      });
    }
    else {
      const report = await runSubjectProjectionVerifyCommand({
        verifier: composition.subjectProjectionCutover.verifier,
        logger: composition.logger,
      }, { manifest, batchSize });
      if (report.status === "failed")
        process.exitCode = 1;
    }
  }
  finally {
    await composition.shutdown(`command:subject-projection:${options.operation}`);
  }
}

if (import.meta.main) {
  try {
    // eslint-disable-next-line antfu/no-top-level-await -- Bun must keep the command alive through shutdown.
    await main();
  }
  catch {
    process.exitCode = 1;
    process.stderr.write(
      "Subject Projection cutover failed; inspect structured logs for the last safe cursor.\n",
    );
  }
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive safe integer`);
}

function requireNonNegativeSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative safe integer`);
}
