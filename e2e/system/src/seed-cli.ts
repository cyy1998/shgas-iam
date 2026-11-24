import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import db, { closeDb } from "@iam/db";
import { redisUrlString } from "@iam/runtime/redis/config";
import Redis from "ioredis";
import { requireEnvironment } from "./environment.ts";
import { seedE2EScenario } from "./seed.ts";
import { createProductionE2EScenarioOwner } from "./seed-owner.ts";
import { persistSeedReceipt, readTemplateSeedReceipt } from "./seed-receipt.ts";

async function withSeedOwner<T>(operation: (owner: ReturnType<typeof createProductionE2EScenarioOwner>) => Promise<T>) {
  const redisConfig = redisUrlString().parse(requireEnvironment("IAM_E2E_REDIS_URL"));
  const redis = new Redis({ ...redisConfig, lazyConnect: true });
  try {
    await redis.connect();
    return await operation(
      createProductionE2EScenarioOwner({
        db,
        redis,
        queueRedis: redisConfig,
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
        passwordHashCost: 10,
      }),
    );
  } finally {
    redis.disconnect(false);
    await closeDb({ timeoutSeconds: 5 });
  }
}

async function runSeed() {
  const runId = requireEnvironment("IAM_E2E_RUN_ID");
  const canonicalOrigin = requireEnvironment("IAM_E2E_ORIGIN");
  const receiptPath = requireEnvironment("IAM_E2E_SEED_RECEIPT_PATH");
  const internalOrigin = process.env.IAM_E2E_INTERNAL_ORIGIN;
  if (process.argv[2] === "restore") {
    const references = readTemplateSeedReceipt(await readFile(receiptPath, "utf8"), {
      runId,
      canonicalOrigin,
      internalOrigin: internalOrigin ?? canonicalOrigin,
    });
    await withSeedOwner((owner) => owner.restoreRedis(references));
    return;
  }

  const attemptedAt = new Date().toISOString();
  await persistSeedReceipt(receiptPath, { version: 1, stage: "seed", status: "attempted", attemptedAt });
  try {
    const references = await withSeedOwner((owner) =>
      seedE2EScenario({
        adminPassword: requireEnvironment("IAM_E2E_ADMIN_PASSWORD"),
        canonicalOrigin,
        internalOrigin,
        owner,
        random: { uuid: randomUUID },
        runId,
      }),
    );
    await persistSeedReceipt(receiptPath, {
      version: 1,
      stage: "seed",
      status: "applied",
      completedAt: new Date().toISOString(),
      scenario: references,
    });
  } catch (error) {
    await persistSeedReceipt(receiptPath, {
      version: 1,
      stage: "seed",
      status: "failed",
      attemptedAt,
      completedAt: new Date().toISOString(),
      failureCategory: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
}

runSeed().catch((error: unknown) => {
  console.error("E2E scenario seed failed; inspect the run-scoped seed receipt");
  if (process.argv[2] !== undefined && error instanceof Error) {
    console.error(error.cause instanceof Error ? error.cause.message : error.message);
  }
  process.exitCode = 1;
});
