import { createOrganizationResponsibilityResolver } from "@iam/assignment-resolution/organization-responsibility";
import { createRoleAssignmentResolver } from "@iam/assignment-resolution/role-assignment";
import type { DbClient } from "@iam/db";
import type { DocumentBuildResult } from "../build/document-builder.service";
import { createUserDocumentBuilder, parseUserDocumentRow } from "../build/user-document-builder";
import type { DocumentFactsCacheRecord, PublishedUserDocument } from "../document";
import {
  createDocumentFactsCacheRecord,
  DocumentFactsCacheRecordSchema,
  USER_DOCUMENT_SCHEMA_VERSION,
} from "../document";
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
  readonly createBuilder: (input: {
    db: DbClient;
    clock: { nowDate: () => Date };
    batchSize: number;
    signal?: AbortSignal;
  }) => {
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

export function createCurrentUserDocumentProjectionBundle() {
  return createUserDocumentProjectionBundle<PublishedUserDocument, DocumentFactsCacheRecord>({
    schemaVersion: USER_DOCUMENT_SCHEMA_VERSION,
    parseDocumentRow: parseUserDocumentRow,
    createBuilder(input) {
      return createUserDocumentBuilder({
        db: input.db,
        roleAssignmentResolver: createRoleAssignmentResolver(input.db),
        responsibilityResolver: createOrganizationResponsibilityResolver(input.db),
        clock: input.clock,
        config: { batchSize: input.batchSize },
        signal: input.signal,
      });
    },
    createFactsRecord(profile) {
      return createDocumentFactsCacheRecord(profile);
    },
    parseFactsRecord: (input) => DocumentFactsCacheRecordSchema.parse(input),
  });
}
