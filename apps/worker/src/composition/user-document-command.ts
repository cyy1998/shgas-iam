import { closeMaintenanceResources, createOfflineMaintenanceRedis } from "@iam/api-core/maintenance";
import { createSubjectAccessRepair, createSubjectAccessTransitionRecovery } from "@iam/api-core/subject-access";
import { createMaintenancePostgresResources } from "@iam/db/maintenance";
import { createSubjectFactsRedisPublisher } from "@iam/user-document";
import {
  createCurrentUserDocumentProjectionBundle,
  createSubjectAccessAuthorityRepository,
  createUserDocumentUpdateProcessor,
  createUserDocumentWriteResources,
  repairSubjectAccess,
  repairUserDocument,
  type UserDocumentRepairOptions,
} from "@iam/user-document/maintenance";
import {
  createSubjectAccessTransitionRecoveryAuthority,
  createSubjectAccessTransitionRepository,
} from "@iam/user-document/subject-access-transition";
import type { DocumentRepairInvocation } from "@worker/env";

type UserDocumentRepairEnv = Pick<DocumentRepairInvocation["env"], "databaseUrl" | "redis" | "userDocument">;

import type { WorkerLogger } from "./runtime";
import { createWorkerSubjectAccess } from "./subject-access";

/** This command owns only its PG connection, Redis and optional producer queue; it starts no consumer. */
export function createUserDocumentCommandComposition(options: {
  env: UserDocumentRepairEnv;
  logger: WorkerLogger;
  deadlineMs: number;
  limit: number;
  postgresInvocationId: string;
  subjectAccessOnly?: boolean;
}) {
  const postgres = createMaintenancePostgresResources({
    databaseUrl: options.env.databaseUrl,
    deadlineMs: options.deadlineMs,
    scope: "user",
    invocationId: options.postgresInvocationId,
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
  const repairDependencies = {
    subjectAccessRepairBacklog: subjectAccess.store,
    subjectAccessRepair: repair,
    subjectAccessTransitionRecovery: transitionRecovery,
    subjectAccessTransitionReaper: createSubjectAccessTransitionRepository(postgres.db),
    logger: options.logger,
    config: {
      limit: options.limit,
      repairStaleSeconds: options.env.userDocument.repairStaleSeconds,
      transitionStaleSeconds: options.env.userDocument.repairStaleSeconds,
    },
  };
  let closing: Promise<void> | undefined;
  return {
    maintenance,
    clock,
    repair(input: UserDocumentRepairOptions) {
      if (!maintenance) throw new Error("User Document maintenance is required");
      return repairUserDocument({ ...repairDependencies, maintenance, clock }, input);
    },
    repairSubjectAccess(input: Pick<UserDocumentRepairOptions, "limit" | "signal">) {
      return repairSubjectAccess(repairDependencies, input);
    },
    connect: redis.connect,
    subjectAccess: {
      repair,
      repairBacklog: subjectAccess.store,
      transitionRecovery,
      transitionReaper: repairDependencies.subjectAccessTransitionReaper,
    },
    shutdown(reason: string) {
      options.logger.info(
        { reason, applicationName: postgres.applicationName },
        options.subjectAccessOnly
          ? "worker Subject Access repair shutting down"
          : "User Document command shutting down",
      );
      closing ??= closeMaintenanceResources([
        Promise.resolve().then(() => redis.close()),
        postgres.close(reason),
        Promise.resolve().then(() => writes?.close()),
      ]);
      return closing;
    },
  };
}
