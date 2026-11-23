import { isDeepStrictEqual } from "node:util";
import type { db as database } from "@iam/db";
import { createInternalUserDocumentQueryRepository } from "@iam/documents/user";
import {
  createCurrentUserDocumentPostgresReadiness,
  createCurrentUserDocumentRedisAccessReadiness,
} from "@iam/documents/user/maintenance";
import { createDocumentFactsCacheRecord, createSubjectFactsRedisInspector } from "@iam/documents/user/subject-facts";
import type { OpsRuntime } from "./runtime";
import { createOpsSubjectAccess } from "./subject-access";

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
  runtime: Pick<OpsRuntime, "clock" | "redis">;
  source: { userId: number; subjectIdentifier: string };
  username: string;
  config: { buildBatchSize: number; batchSize: number };
  signal?: AbortSignal;
}) {
  const { db, runtime, source, config, signal } = input;
  const { bootstrap } = createOpsSubjectAccess(runtime);
  const readinessInput = { db, clock: runtime.clock, config: { buildBatchSize: config.buildBatchSize } };
  const postgres = createCurrentUserDocumentPostgresReadiness(readinessInput);
  const access = createCurrentUserDocumentRedisAccessReadiness({
    ...readinessInput,
    subjectFactsRedis: runtime.redis,
    subjectAccessBootstrap: bootstrap,
  });
  const documents = createInternalUserDocumentQueryRepository(db);
  const inspector = createSubjectFactsRedisInspector(runtime.redis);
  const batch = { batchSize: config.batchSize, signal };
  return await completeInitializationAccess({
    verifyPostgres: () => postgres.verify(batch),
    async factsArePublished() {
      signal?.throwIfAborted();
      const row = await documents.getCurrentByUsername(input.username);
      if (!row || row.userId !== source.userId || row.subjectIdentifier !== source.subjectIdentifier) return false;
      const [facts] = await inspector.inspectMany([source.subjectIdentifier]);
      return facts?.status === "valid" && isDeepStrictEqual(facts.record, createDocumentFactsCacheRecord(row));
    },
    seedAccess() {
      signal?.throwIfAborted();
      return bootstrap.seedMany(
        [{ subjectIdentifier: source.subjectIdentifier, state: "enabled" }],
        runtime.clock.nowDate(),
      );
    },
    verifyAccess: () => access.verify(batch),
  });
}
