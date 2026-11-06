import { closeMaintenanceResources, createOfflineMaintenanceRedis } from "@iam/api-core/maintenance";
import type { RedisConfig } from "@iam/api-core/redis";
import { createMaintenancePostgresResources } from "@iam/db/maintenance";
import {
  createCurrentUserDocumentPostgresReadiness,
  createCurrentUserDocumentRedisAccessReadiness,
} from "@iam/user-document/maintenance";
import type { OpsLogger } from "./runtime";
import { createOpsSubjectAccess } from "./subject-access";

export function createUserDocumentReadinessCommandComposition(options: {
  databaseUrl: string;
  buildBatchSize: number;
  logger: OpsLogger;
  deadlineMs: number;
  redis?: RedisConfig;
}) {
  const postgres = createMaintenancePostgresResources({ ...options, scope: "user" });
  const clock = { nowDate: () => new Date(), now: Date.now };
  const redis = options.redis ? createOfflineMaintenanceRedis(options.redis, new AbortController().signal) : undefined;
  const verifierInput = { db: postgres.db, clock, config: { buildBatchSize: options.buildBatchSize } };
  const gate = redis
    ? createCurrentUserDocumentRedisAccessReadiness({
        ...verifierInput,
        subjectFactsRedis: redis.redis,
        subjectAccessBootstrap: createOpsSubjectAccess({ redis: redis.redis, clock }).bootstrap,
      })
    : createCurrentUserDocumentPostgresReadiness(verifierInput);
  let closing: Promise<void> | undefined;
  return {
    async verify(input: { batchSize: number; signal?: AbortSignal }) {
      if (redis) await redis.connect();
      return await gate.verify(input);
    },
    shutdown(reason: string) {
      options.logger.info(
        { reason, applicationName: postgres.applicationName },
        `User Document ${redis ? "Redis" : "PostgreSQL"} readiness command shutting down`,
      );
      closing ??= closeMaintenanceResources([Promise.resolve().then(() => redis?.close()), postgres.close(reason)]);
      return closing;
    },
  };
}
