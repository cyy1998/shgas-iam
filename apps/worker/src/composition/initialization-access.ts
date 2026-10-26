import { isDeepStrictEqual } from "node:util";
import type { db as database } from "@iam/db";
import { userProfiles } from "@iam/db/schema";
import {
  createSubjectFactsCacheRecord,
  createSubjectFactsRedisInspector,
  PublishedProfileSchema,
  parseUserProfileDetailDocument,
} from "@iam/user-profile-read-model";
import {
  createCurrentUserProfilePostgresReadiness,
  createCurrentUserProfileRedisAccessReadiness,
} from "@iam/user-profile-read-model/worker";
import { eq } from "drizzle-orm";
import type { WorkerRuntime } from "./runtime";
import { createWorkerSubjectAccess } from "./subject-access";

interface InitializationAccessDependencies {
  verifyPostgres(): Promise<{ status: "passed" | "failed" }>;
  factsArePublished(): Promise<boolean>;
  seedAccess(): Promise<{ seeded: number; retainedExisting: number }>;
  verifyAccess(): Promise<{ status: "passed" | "failed" }>;
}

export async function completeInitializationAccess(deps: InitializationAccessDependencies) {
  if ((await deps.verifyPostgres()).status !== "passed") throw new Error("initialization-postgres-publication-pending");
  if (!(await deps.factsArePublished())) throw new Error("initialization-redis-facts-pending");
  const seeded = await deps.seedAccess();
  if ((await deps.verifyAccess()).status !== "passed") throw new Error("initialization-access-not-verified");
  return seeded;
}

export async function completePublishedInitializationAccess(input: {
  db: typeof database;
  runtime: Pick<WorkerRuntime, "clock" | "redis">;
  source: { userId: number; subjectIdentifier: string };
  config: { buildBatchSize: number; batchSize: number };
}) {
  const { db, runtime, source, config } = input;
  const { bootstrap } = createWorkerSubjectAccess(runtime);
  const readinessInput = { db, clock: runtime.clock, config: { buildBatchSize: config.buildBatchSize } };
  const postgres = createCurrentUserProfilePostgresReadiness(readinessInput);
  const access = createCurrentUserProfileRedisAccessReadiness({
    ...readinessInput,
    subjectFactsRedis: runtime.redis,
    subjectAccessBootstrap: bootstrap,
  });
  const batch = { batchSize: config.batchSize };
  return await completeInitializationAccess({
    verifyPostgres: () => postgres.verify(batch),
    async factsArePublished() {
      const [profile] = await db
        .select({
          userId: userProfiles.userId,
          subjectIdentifier: userProfiles.subjectIdentifier,
          username: userProfiles.username,
          name: userProfiles.name,
          mobile: userProfiles.mobile,
          wxId: userProfiles.wxId,
          status: userProfiles.status,
          isDelete: userProfiles.isDelete,
          searchVisible: userProfiles.searchVisible,
          profileSchemaVersion: userProfiles.profileSchemaVersion,
          sourceDirtyVersion: userProfiles.sourceDirtyVersion,
          detail: userProfiles.detail,
          searchDoc: userProfiles.searchDoc,
          subjectFacts: userProfiles.subjectFacts,
          rebuiltAt: userProfiles.rebuiltAt,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, source.userId));
      if (!profile || profile.subjectIdentifier !== source.subjectIdentifier) return false;
      const parsed = PublishedProfileSchema.parse({
        ...profile,
        detail: parseUserProfileDetailDocument(profile.detail),
      });
      const [facts] = await createSubjectFactsRedisInspector(runtime.redis).inspectMany([source.subjectIdentifier]);
      return (
        facts?.status === "valid" &&
        isDeepStrictEqual(facts.record, createSubjectFactsCacheRecord(parsed, parsed.rebuiltAt))
      );
    },
    seedAccess: () =>
      bootstrap.seedMany([{ subjectIdentifier: source.subjectIdentifier, state: "enabled" }], runtime.clock.nowDate()),
    verifyAccess: () => access.verify(batch),
  });
}
