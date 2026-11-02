import type { SubjectAccessBootstrap } from "@iam/api-core/subject-access";
import type { DbClient, db as database } from "@iam/db";
import type { PublishedUserDocument } from "../document";
import type { SubjectFactsRedisInspectionClient } from "../subject-facts/subject-facts-redis-publisher.core";
import type { UserDocumentProjectionBundle } from "../worker/user-document-projection";
import { createCurrentUserDocumentProjectionBundle } from "../worker/user-document-projection";
import { createUserDocumentPostgresGate, createUserDocumentRedisAccessGate } from "./user-document-readiness";
import { createUserDocumentReadinessRepository } from "./user-document-readiness.repository";

export function createUserDocumentReadinessWithProjection<
  TDocument extends PublishedUserDocument,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceVersion: string;
  },
>(input: {
  db: typeof database;
  subjectFactsRedis: SubjectFactsRedisInspectionClient;
  subjectAccessBootstrap: Pick<SubjectAccessBootstrap, "inspectMany">;
  projection: UserDocumentProjectionBundle<TDocument, TFactsRecord>;
  clock: { nowDate: () => Date };
  config: { buildBatchSize: number };
}) {
  return {
    postgresGate: createUserDocumentPostgresReadinessWithProjection(input),
    redisAccessGate: createUserDocumentRedisAccessReadinessWithProjection(input),
  };
}

export function createUserDocumentPostgresReadinessWithProjection<
  TDocument extends PublishedUserDocument,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceVersion: string;
  },
>(input: {
  db: typeof database;
  projection: UserDocumentProjectionBundle<TDocument, TFactsRecord>;
  clock: { nowDate: () => Date };
  config: { buildBatchSize: number };
}) {
  return {
    async verify(options: { batchSize: number; signal?: AbortSignal }) {
      options.signal?.throwIfAborted();
      const observedAt = input.clock.nowDate();
      return await input.db.transaction(
        async (tx) => {
          const report = await createUserDocumentPostgresGate({
            schemaVersion: input.projection.schemaVersion,
            repository: createReadinessRepository({ ...input, db: tx }),
            clock: { nowDate: () => observedAt },
          }).verify(options);
          options.signal?.throwIfAborted();
          return report;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}

export function createUserDocumentRedisAccessReadinessWithProjection<
  TDocument extends PublishedUserDocument,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceVersion: string;
  },
>(input: {
  db: typeof database;
  subjectFactsRedis: SubjectFactsRedisInspectionClient;
  subjectAccessBootstrap: Pick<SubjectAccessBootstrap, "inspectMany">;
  projection: UserDocumentProjectionBundle<TDocument, TFactsRecord>;
  clock: { nowDate: () => Date };
  config: { buildBatchSize: number };
}) {
  const subjectFactsInspector = input.projection.subjectFacts.createInspector(input.subjectFactsRedis);
  return {
    async verify(options: { batchSize: number; signal?: AbortSignal }) {
      options.signal?.throwIfAborted();
      const observedAt = input.clock.nowDate();
      return await input.db.transaction(
        async (tx) => {
          const report = await createUserDocumentRedisAccessGate({
            schemaVersion: input.projection.schemaVersion,
            inventory: createReadinessRepository({ ...input, db: tx }),
            subjectFacts: {
              createRecord: input.projection.subjectFacts.createRecord,
              inspectMany: subjectFactsInspector.inspectMany,
            },
            subjectAccess: input.subjectAccessBootstrap,
            clock: { nowDate: () => observedAt },
          }).verify(options);
          options.signal?.throwIfAborted();
          return report;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}

export function createCurrentUserDocumentReadiness(
  input: Omit<Parameters<typeof createUserDocumentReadinessWithProjection>[0], "projection">,
) {
  return createUserDocumentReadinessWithProjection({
    ...input,
    projection: createCurrentUserDocumentProjectionBundle(),
  });
}

export function createCurrentUserDocumentPostgresReadiness(
  input: Omit<Parameters<typeof createUserDocumentPostgresReadinessWithProjection>[0], "projection">,
) {
  return createUserDocumentPostgresReadinessWithProjection({
    ...input,
    projection: createCurrentUserDocumentProjectionBundle(),
  });
}

export function createCurrentUserDocumentRedisAccessReadiness(
  input: Omit<Parameters<typeof createUserDocumentRedisAccessReadinessWithProjection>[0], "projection">,
) {
  return createUserDocumentRedisAccessReadinessWithProjection({
    ...input,
    projection: createCurrentUserDocumentProjectionBundle(),
  });
}

function createReadinessRepository<
  TDocument extends PublishedUserDocument,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceVersion: string;
  },
>(input: {
  db: DbClient;
  projection: UserDocumentProjectionBundle<TDocument, TFactsRecord>;
  config: { buildBatchSize: number };
}) {
  return createUserDocumentReadinessRepository(input.db, {
    projection: input.projection,
    buildBatchSize: input.config.buildBatchSize,
  });
}
