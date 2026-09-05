import type { SubjectAccessBootstrap } from "@iam/api-core/subject-access";
import type { DbClient } from "@iam/db";
import type { PublishedProfileRowInput } from "../schema/profile-storage.schema";
import type {
  SubjectFactsRedisInspectionClient,
} from "../subject-facts/subject-facts-redis-publisher.core";
import type { UserProfileProjectionBundle } from "../worker/user-profile-projection";
import { createCurrentUserProfileProjectionBundle } from "../worker/user-profile-worker.module";
import {
  createUserProfilePostgresGate,
  createUserProfileRedisAccessGate,
} from "./user-profile-readiness";
import { createUserProfileReadinessRepository } from "./user-profile-readiness.repository";

export function createUserProfileReadinessWithProjection<
  TProfile extends PublishedProfileRowInput,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceDirtyVersion: string;
  },
>(input: {
  db: DbClient;
  subjectFactsRedis: SubjectFactsRedisInspectionClient;
  subjectAccessBootstrap: Pick<SubjectAccessBootstrap, "inspectMany">;
  projection: UserProfileProjectionBundle<TProfile, TFactsRecord>;
  clock: { nowDate: () => Date };
  config: { buildBatchSize: number };
}) {
  return {
    postgresGate: createUserProfilePostgresReadinessWithProjection(input),
    redisAccessGate: createUserProfileRedisAccessReadinessWithProjection(input),
  };
}

export function createUserProfilePostgresReadinessWithProjection<
  TProfile extends PublishedProfileRowInput,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceDirtyVersion: string;
  },
>(input: {
  db: DbClient;
  projection: UserProfileProjectionBundle<TProfile, TFactsRecord>;
  clock: { nowDate: () => Date };
  config: { buildBatchSize: number };
}) {
  const repository = createReadinessRepository(input);
  return createUserProfilePostgresGate({
    schemaVersion: input.projection.schemaVersion,
    repository,
    clock: input.clock,
  });
}

export function createUserProfileRedisAccessReadinessWithProjection<
  TProfile extends PublishedProfileRowInput,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceDirtyVersion: string;
  },
>(input: {
  db: DbClient;
  subjectFactsRedis: SubjectFactsRedisInspectionClient;
  subjectAccessBootstrap: Pick<SubjectAccessBootstrap, "inspectMany">;
  projection: UserProfileProjectionBundle<TProfile, TFactsRecord>;
  clock: { nowDate: () => Date };
  config: { buildBatchSize: number };
}) {
  const repository = createReadinessRepository(input);
  const subjectFactsInspector = input.projection.subjectFacts.createInspector(
    input.subjectFactsRedis,
  );
  return createUserProfileRedisAccessGate({
    schemaVersion: input.projection.schemaVersion,
    inventory: repository,
    subjectFacts: {
      createRecord: input.projection.subjectFacts.createRecord,
      inspectMany: subjectFactsInspector.inspectMany,
    },
    subjectAccess: input.subjectAccessBootstrap,
    clock: input.clock,
  });
}

export function createCurrentUserProfileReadiness(
  input: Omit<
    Parameters<typeof createUserProfileReadinessWithProjection>[0],
    "projection"
  >,
) {
  return createUserProfileReadinessWithProjection({
    ...input,
    projection: createCurrentUserProfileProjectionBundle(),
  });
}

export function createCurrentUserProfilePostgresReadiness(
  input: Omit<
    Parameters<typeof createUserProfilePostgresReadinessWithProjection>[0],
    "projection"
  >,
) {
  return createUserProfilePostgresReadinessWithProjection({
    ...input,
    projection: createCurrentUserProfileProjectionBundle(),
  });
}

export function createCurrentUserProfileRedisAccessReadiness(
  input: Omit<
    Parameters<typeof createUserProfileRedisAccessReadinessWithProjection>[0],
    "projection"
  >,
) {
  return createUserProfileRedisAccessReadinessWithProjection({
    ...input,
    projection: createCurrentUserProfileProjectionBundle(),
  });
}

function createReadinessRepository<
  TProfile extends PublishedProfileRowInput,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceDirtyVersion: string;
  },
>(input: {
  db: DbClient;
  projection: UserProfileProjectionBundle<TProfile, TFactsRecord>;
  config: { buildBatchSize: number };
}) {
  return createUserProfileReadinessRepository(input.db, {
    projection: input.projection,
    buildBatchSize: input.config.buildBatchSize,
  });
}
