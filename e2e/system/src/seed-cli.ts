import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import db, { closeDb } from "@iam/db";
import { redisUrlString } from "@iam/runtime/redis/config";
import Redis from "ioredis";
import { writeAtomicJsonFile } from "./atomic-json-file.ts";
import { requireEnvironment } from "./environment.ts";
import { type E2EScenarioReferences, seedE2EScenario } from "./seed.ts";
import { createProductionE2EScenarioOwner } from "./seed-owner.ts";

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
  const scenarioPath = requireEnvironment("IAM_E2E_SCENARIO_PATH");
  const internalOrigin = process.env.IAM_E2E_INTERNAL_ORIGIN;
  if (process.argv[2] === "restore") {
    const references = JSON.parse(await readFile(scenarioPath, "utf8")) as E2EScenarioReferences;
    if (
      references?.version !== 1 ||
      references.runId !== runId ||
      references.canonicalOrigin !== canonicalOrigin ||
      (references.internalOrigin ?? references.canonicalOrigin) !== (internalOrigin ?? canonicalOrigin)
    ) {
      throw new Error("E2E scenario references do not match the current runtime");
    }
    await withSeedOwner((owner) => owner.restoreRedis(references));
    return;
  }

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
  await writeAtomicJsonFile(scenarioPath, references, 0o600);
}

runSeed().catch((error: unknown) => {
  console.error("E2E scenario seed failed");
  if (error instanceof Error) {
    console.error(error.cause instanceof Error ? error.cause.message : error.message);
  }
  process.exitCode = 1;
});
