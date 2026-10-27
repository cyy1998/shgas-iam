import { DocumentEmploymentSchema, DocumentUserSchema } from "@iam/contracts";
import { z } from "zod";

export const USER_DOCUMENT_SCHEMA_VERSION = 1;

export const DocumentSourceVersionSchema = z.string().regex(/^[1-9]\d*$/u);

export const DocumentClientAuthorizationSchema = z
  .object({
    clientCode: z.string().min(1),
    roles: z.array(z.object({ code: z.string().min(1) }).strict()).min(1),
  })
  .strict();

export const StoredDocumentEmploymentSchema = DocumentEmploymentSchema.omit({ roles: true })
  .extend({
    clientAuthorizations: z.array(DocumentClientAuthorizationSchema),
  })
  .strict();

export const StoredUserDocumentSchema = z
  .object({
    user: DocumentUserSchema.strict(),
    employments: z.array(StoredDocumentEmploymentSchema),
  })
  .strict();

export const PublishedUserDocumentMetadataSchema = z
  .object({
    userId: z.number().int().positive(),
    subjectIdentifier: z.uuid(),
    schemaVersion: z.literal(USER_DOCUMENT_SCHEMA_VERSION),
    sourceVersion: DocumentSourceVersionSchema,
    publishedAt: z.date(),
  })
  .strict();

export const PublishedUserDocumentSchema = PublishedUserDocumentMetadataSchema.extend({
  document: StoredUserDocumentSchema.nullable(),
}).superRefine((publication, context) => {
  if (publication.document !== null && publication.document.user.subjectIdentifier !== publication.subjectIdentifier) {
    context.addIssue({
      code: "custom",
      path: ["document", "user", "subjectIdentifier"],
      message: "文档主体与发布身份不一致",
    });
  }
});

export const DocumentSubjectFactsSchema = z
  .object({
    profile: z.object({ username: z.string().min(1), name: z.string().min(1), phone: z.string().nullable() }).strict(),
    employments: z.array(StoredDocumentEmploymentSchema),
  })
  .strict();

const cacheMetadata = {
  userId: z.number().int().positive(),
  subjectIdentifier: z.uuid(),
  schemaVersion: z.literal(USER_DOCUMENT_SCHEMA_VERSION),
  sourceVersion: DocumentSourceVersionSchema,
  publishedAt: z.iso.datetime(),
};

export const DocumentFactsCacheRecordSchema = z.discriminatedUnion("kind", [
  z.object({ ...cacheMetadata, kind: z.literal("document"), facts: DocumentSubjectFactsSchema }).strict(),
  z.object({ ...cacheMetadata, kind: z.literal("tombstone") }).strict(),
]);

export type StoredUserDocument = z.infer<typeof StoredUserDocumentSchema>;
export type PublishedUserDocument = z.infer<typeof PublishedUserDocumentSchema>;
export type PublishedUserDocumentRow = Omit<PublishedUserDocument, "schemaVersion" | "document"> & {
  schemaVersion: number;
  document: unknown;
};
export type DocumentFactsCacheRecord = z.infer<typeof DocumentFactsCacheRecordSchema>;
export type DocumentSubjectFactsSnapshot = z.infer<typeof DocumentSubjectFactsSchema> & {
  readonly subjectIdentifier: string;
  readonly sourceVersion: string;
};

export type DocumentFactsReadResult =
  | { readonly kind: "missing" }
  | { readonly kind: "tombstone"; readonly record: Extract<DocumentFactsCacheRecord, { kind: "tombstone" }> }
  | {
      readonly kind: "document";
      readonly record: Extract<DocumentFactsCacheRecord, { kind: "document" }>;
      readonly facts: DocumentSubjectFactsSnapshot;
    };

export interface DocumentFactsReaderPort {
  readonly read: (subjectIdentifier: string) => Promise<DocumentFactsReadResult>;
}

export function createDocumentFactsCacheRecord(input: unknown): DocumentFactsCacheRecord {
  const publication = PublishedUserDocumentSchema.parse(input);
  const metadata = {
    userId: publication.userId,
    subjectIdentifier: publication.subjectIdentifier,
    schemaVersion: publication.schemaVersion,
    sourceVersion: publication.sourceVersion,
    publishedAt: publication.publishedAt.toISOString(),
  };
  if (publication.document === null) return { ...metadata, kind: "tombstone" };
  return DocumentFactsCacheRecordSchema.parse({
    ...metadata,
    kind: "document",
    facts: {
      profile: {
        username: publication.document.user.username,
        name: publication.document.user.name,
        phone: publication.document.user.mobile,
      },
      employments: publication.document.employments,
    },
  });
}

export function readDocumentFactsRecord(serialized: string | null): DocumentFactsReadResult {
  if (serialized === null) return { kind: "missing" };
  const record = DocumentFactsCacheRecordSchema.parse(JSON.parse(serialized));
  if (record.kind === "tombstone") return { kind: "tombstone", record };
  return {
    kind: "document",
    record,
    facts: { subjectIdentifier: record.subjectIdentifier, sourceVersion: record.sourceVersion, ...record.facts },
  };
}
