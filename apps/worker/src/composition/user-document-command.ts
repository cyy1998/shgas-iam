import { createSubjectAccessRepair, createSubjectAccessTransitionRecovery } from "@iam/api-core/subject-access";
import { createSubjectFactsRedisPublisher } from "@iam/user-document";
import {
  createSubjectAccessTransitionRecoveryAuthority,
  createSubjectAccessTransitionRepository,
} from "@iam/user-document/subject-access-transition";
import {
  createCurrentUserDocumentProjectionBundle,
  createSubjectAccessAuthorityRepository,
  createUserDocumentUpdateProcessor,
  createUserDocumentWriteResources,
} from "@iam/user-document/worker";
import type { UserDocumentCommandEnv } from "@worker/env";
import { closeWorkerCommandResources } from "./command-shutdown";
import { createDocumentCommandPostgresResources } from "./document-postgres-resources";
import { createOfflineMaintenanceRedis } from "./offline-maintenance-redis";
import type { WorkerLogger } from "./runtime";
import { createWorkerSubjectAccess } from "./subject-access";

/** This command owns only its PG connection, Redis and optional producer queue; it starts no consumer. */
export function createUserDocumentCommandComposition(options: {
  env: UserDocumentCommandEnv;
  logger: WorkerLogger;
  deadlineMs: number;
  subjectAccessOnly?: boolean;
}) {
  const postgres = createDocumentCommandPostgresResources({
    databaseUrl: options.env.databaseUrl,
    deadlineMs: options.deadlineMs,
    scope: "user",
  });
  const redis = createOfflineMaintenanceRedis(options.env.redis, new AbortController().signal);
  const clock = { nowDate: () => new Date(), now: Date.now };
  const subjectAccess = createWorkerSubjectAccess({ redis: redis.redis, clock });
  const repair = createSubjectAccessRepair({
    authority: createSubjectAccessAuthorityRepository({
      db: postgres.db,
      subjectFactsPublisher: createSubjectFactsRedisPublisher(redis.redis),
    }),
    backlog: subjectAccess.store,
    barrier: subjectAccess.barrier,
    logger: options.logger,
  });
  const transitionRecovery = createSubjectAccessTransitionRecovery({
    authority: createSubjectAccessTransitionRecoveryAuthority({
      transaction: async (callback) => await postgres.db.transaction(async (tx) => await callback(tx)),
    }),
    backlog: subjectAccess.store,
    logger: options.logger,
  });
  const writes = options.subjectAccessOnly
    ? undefined
    : createUserDocumentWriteResources({
        redis: options.env.redis,
        logger: options.logger,
        batchSize: options.env.userDocument.rebuildBatchSize,
      });
  const maintenance = writes
    ? createUserDocumentUpdateProcessor({
        db: postgres.db,
        projection: createCurrentUserDocumentProjectionBundle(),
        jobProducer: writes.jobProducer,
        subjectFactsPublisher: createSubjectFactsRedisPublisher(redis.redis),
        subjectAccessRepair: repair,
        clock,
        logger: options.logger,
        batchSize: options.env.userDocument.rebuildBatchSize,
      })
    : undefined;
  let closing: Promise<void> | undefined;
  return {
    maintenance,
    clock,
    connect: redis.connect,
    subjectAccess: {
      repair,
      repairBacklog: subjectAccess.store,
      transitionRecovery,
      transitionReaper: createSubjectAccessTransitionRepository(postgres.db),
    },
    shutdown(reason: string) {
      options.logger.info(
        { reason, applicationName: postgres.applicationName },
        options.subjectAccessOnly
          ? "worker Subject Access repair shutting down"
          : "User Document command shutting down",
      );
      closing ??= closeWorkerCommandResources([
        Promise.resolve().then(() => redis.close()),
        postgres.close(reason),
        Promise.resolve().then(() => writes?.close()),
      ]);
      return closing;
    },
  };
}
