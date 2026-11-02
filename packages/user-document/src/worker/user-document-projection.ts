import type { DbClient } from "@iam/db";
import type { DocumentBuildResult } from "../build/document-builder.service";
import type { PublishedUserDocument } from "../document";
import { createUserDocumentRowRepository } from "../publication/user-document-row.repository";
import type {
  CreateSubjectFactsRedisPublisherOptions,
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "../subject-facts/subject-facts-redis-publisher.core";
import {
  createMonotonicSubjectFactsRedisPublisher,
  createSubjectFactsRedisInspector,
} from "../subject-facts/subject-facts-redis-publisher.core";

export interface UserDocumentProjectionBundle<
  TDocument extends PublishedUserDocument,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceVersion: string;
  },
> {
  readonly schemaVersion: number;
  readonly parseDocumentRow: (input: unknown) => TDocument;
  readonly createBuilder: (input: { db: DbClient; clock: { nowDate: () => Date }; batchSize: number }) => {
    buildOne: (target: { userId: number; sourceVersion: string }) => Promise<TDocument | null>;
    buildMany: (targets: Array<{ userId: number; sourceVersion: string }>) => Promise<TDocument[]>;
    buildManyResults: (
      targets: Array<{ userId: number; sourceVersion: string }>,
    ) => Promise<DocumentBuildResult<TDocument>[]>;
  };
  readonly createRowRepository: typeof createUserDocumentRowRepository;
  readonly subjectFacts: {
    createRecord: (profile: TDocument) => TFactsRecord;
    createPublisher: (
      redis: SubjectFactsRedisClient,
      options?: CreateSubjectFactsRedisPublisherOptions,
    ) => ReturnType<typeof createMonotonicSubjectFactsRedisPublisher<TFactsRecord>>;
    createInspector: (
      redis: SubjectFactsRedisInspectionClient,
      options?: CreateSubjectFactsRedisPublisherOptions,
    ) => ReturnType<typeof createSubjectFactsRedisInspector<TFactsRecord>>;
  };
}

export function createUserDocumentProjectionBundle<
  TDocument extends PublishedUserDocument,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceVersion: string;
  },
>(input: {
  schemaVersion: number;
  parseDocumentRow: (row: unknown) => TDocument;
  createBuilder: UserDocumentProjectionBundle<TDocument, TFactsRecord>["createBuilder"];
  createFactsRecord: (profile: TDocument) => TFactsRecord;
  parseFactsRecord: (input: unknown) => TFactsRecord;
}): UserDocumentProjectionBundle<TDocument, TFactsRecord> {
  return {
    schemaVersion: input.schemaVersion,
    parseDocumentRow: input.parseDocumentRow,
    createBuilder: input.createBuilder,
    createRowRepository: createUserDocumentRowRepository,
    subjectFacts: {
      createRecord: input.createFactsRecord,
      createPublisher(redis, options = {}) {
        return createMonotonicSubjectFactsRedisPublisher(redis, input.parseFactsRecord, options);
      },
      createInspector(redis, options = {}) {
        return createSubjectFactsRedisInspector(redis, input.parseFactsRecord, options);
      },
    },
  };
}
