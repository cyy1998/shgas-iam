import { randomUUID } from "node:crypto";
import db, { closeDb } from "@iam/db";
import Redis from "ioredis";
import { requireEnvironment } from "./environment.ts";
import { createProductionE2EScenarioOwner } from "./seed-owner.ts";
import { persistSeedReceipt } from "./seed-receipt.ts";
import { seedE2EScenario } from "./seed.ts";

async function runSeed() {
  const runId = requireEnvironment("IAM_E2E_RUN_ID");
  const canonicalOrigin = requireEnvironment("IAM_E2E_ORIGIN");
  const receiptPath = requireEnvironment("IAM_E2E_SEED_RECEIPT_PATH");
  const attemptedAt = new Date().toISOString();
  await persistSeedReceipt(receiptPath, {
    version: 1,
    stage: "seed",
    status: "attempted",
    attemptedAt,
  });

  const redis = new Redis({
    host: requireEnvironment("IAM_E2E_REDIS_HOST"),
    port: requireIntegerEnvironment("IAM_E2E_REDIS_PORT"),
    db: requireIntegerEnvironment("IAM_E2E_REDIS_DB"),
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const references = await seedE2EScenario({
      adminPassword: requireEnvironment("IAM_E2E_ADMIN_PASSWORD"),
      canonicalOrigin,
      owner: createProductionE2EScenarioOwner({
        db,
        redis,
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
        passwordHashCost: 10,
      }),
      random: { uuid: randomUUID },
      runId,
    });
    await persistSeedReceipt(receiptPath, {
      version: 1,
      stage: "seed",
      status: "applied",
      completedAt: new Date().toISOString(),
      scenario: references,
    });
  }
  catch (error) {
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
  finally {
    redis.disconnect(false);
    await closeDb({ timeoutSeconds: 5 });
  }
}

function requireIntegerEnvironment(name: string) {
  const value = Number(requireEnvironment(name));
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer`);
  return value;
}

runSeed().catch(() => {
  console.error("E2E scenario seed failed; inspect the run-scoped seed receipt");
  process.exitCode = 1;
});
