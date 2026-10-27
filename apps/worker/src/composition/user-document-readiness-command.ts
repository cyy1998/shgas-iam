import type { RedisConfig } from "@iam/api-core/redis";
import {
  createCurrentUserDocumentPostgresReadiness,
  createCurrentUserDocumentRedisAccessReadiness,
} from "@iam/user-document/worker";
import { closeWorkerCommandResources } from "./command-shutdown";
import { createDocumentCommandPostgresResources } from "./document-postgres-resources";
import { createOfflineMaintenanceRedis } from "./offline-maintenance-redis";
import type { WorkerLogger } from "./runtime";
import { createWorkerSubjectAccess } from "./subject-access";

export function createUserDocumentReadinessCommandComposition(options: {
  databaseUrl: string;
  buildBatchSize: number;
  logger: WorkerLogger;
  deadlineMs: number;
  redis?: RedisConfig & { username?: string };
}) {
  const postgres = createDocumentCommandPostgresResources({ ...options, scope: "user" });
  const clock = { nowDate: () => new Date(), now: Date.now };
  const redis = options.redis
    ? createOfflineMaintenanceRedis(
        { ...options.redis, username: options.redis.username, password: options.redis.password },
        new AbortController().signal,
      )
    : undefined;
  const verifierInput = { db: postgres.db, clock, config: { buildBatchSize: options.buildBatchSize } };
  const gate = redis
    ? createCurrentUserDocumentRedisAccessReadiness({
        ...verifierInput,
        subjectFactsRedis: redis.redis,
        subjectAccessBootstrap: createWorkerSubjectAccess({ redis: redis.redis, clock }).bootstrap,
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
      closing ??= closeWorkerCommandResources([Promise.resolve().then(() => redis?.close()), postgres.close(reason)]);
      return closing;
    },
  };
}
