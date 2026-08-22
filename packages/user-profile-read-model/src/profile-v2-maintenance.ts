import type { SubjectAccessBootstrap } from "@iam/api-core/subject-access";
import type { db as database } from "@iam/db";
import type { CreateProfileV2MaintenanceRepositoryOptions } from "./profile-v2-maintenance.repository";
import type {
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "./subject-facts-redis-publisher.core";
import { createProfileV2Backfill } from "./profile-v2-backfill";
import { createProfileV2MaintenanceRepository } from "./profile-v2-maintenance.repository";
import { createProfileV2PostgresGate } from "./profile-v2-postgres-gate";
import { createProfileV2RedisAccessGate } from "./profile-v2-redis-access-gate";
import {
  createSubjectFactsRedisInspector,
  createSubjectFactsRedisPublisher,
} from "./subject-facts-redis";

export function createProfileV2MaintenanceWithResolvers(input: {
  db: typeof database;
  subjectFactsRedis: SubjectFactsRedisClient & SubjectFactsRedisInspectionClient;
  subjectAccessBootstrap: Pick<SubjectAccessBootstrap, "inspectMany" | "seedMany">;
  clock: { nowDate: () => Date };
  config: {
    buildBatchSize: number;
    createRoleAssignmentResolver: CreateProfileV2MaintenanceRepositoryOptions["createRoleAssignmentResolver"];
    createResponsibilityResolver: CreateProfileV2MaintenanceRepositoryOptions["createResponsibilityResolver"];
  };
}) {
  const repository = createProfileV2MaintenanceRepository(input.db, {
    buildBatchSize: input.config.buildBatchSize,
    createRoleAssignmentResolver: input.config.createRoleAssignmentResolver,
    createResponsibilityResolver: input.config.createResponsibilityResolver,
  });
  const subjectFactsPublisher = createSubjectFactsRedisPublisher(
    input.subjectFactsRedis,
  );
  const subjectFactsInspector = createSubjectFactsRedisInspector(
    input.subjectFactsRedis,
  );
  return {
    backfill: createProfileV2Backfill({
      repository,
      subjectFacts: {
        publishMany: subjectFactsPublisher.publishMany,
        inspectMany: subjectFactsInspector.inspectMany,
      },
      subjectAccess: input.subjectAccessBootstrap,
      clock: input.clock,
    }),
    postgresGate: createProfileV2PostgresGate({
      repository,
      clock: input.clock,
    }),
    redisAccessGate: createProfileV2RedisAccessGate({
      inventory: repository,
      subjectFacts: subjectFactsInspector,
      subjectAccess: input.subjectAccessBootstrap,
      clock: input.clock,
    }),
  };
}

export type ProfileV2Maintenance = ReturnType<typeof createProfileV2MaintenanceWithResolvers>;
