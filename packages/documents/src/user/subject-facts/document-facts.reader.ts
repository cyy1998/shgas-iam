import type { DbClient } from "@iam/db";
import { userDocuments } from "@iam/db/schema";
import { eq } from "drizzle-orm";
import {
  createDocumentFactsCacheRecord,
  type DocumentFactsCacheRecord,
  DocumentFactsCacheRecordSchema,
  type DocumentFactsReadResult,
  readDocumentFactsRecord,
  USER_DOCUMENT_SCHEMA_VERSION,
} from "../document";
import { publishedUserDocumentColumns } from "../publication/user-document-columns";
import type {
  SubjectFactsReaderObservabilityPort,
  SubjectFactsReaderObservation,
} from "./subject-facts-observability.contract";
export interface SubjectFactsReaderCachePort {
  read(subjectIdentifier: string): Promise<string | null>;
  publish(record: DocumentFactsCacheRecord): Promise<{ status: "published" | "retained-newer" }>;
}
export interface CreateSubjectFactsReaderOptions {
  db: DbClient;
  cache: SubjectFactsReaderCachePort;
  clock?: { now(): number };
  observability?: SubjectFactsReaderObservabilityPort;
}
export function createDocumentFactsReader(options: CreateSubjectFactsReaderOptions) {
  const loads = new Map<string, Promise<DocumentFactsCacheRecord | null>>();
  const now = options.clock?.now ?? Date.now;
  function observe(observation: SubjectFactsReaderObservation) {
    try {
      options.observability?.record(observation);
    } catch {
      /* Diagnostics do not change authentication. */
    }
  }
  function load(subjectIdentifier: string) {
    const existing = loads.get(subjectIdentifier);
    if (existing) {
      const started = now();
      return existing.finally(() =>
        observe({ operation: "single-flight-wait", outcome: "joined", durationMs: Math.max(0, now() - started) }),
      );
    }
    const started = now();
    const pending = loadPublishedRecord(options.db, subjectIdentifier)
      .then(
        async (record) => {
          observe({
            operation: "document-load",
            outcome: record ? "ready" : "not-ready",
            durationMs: Math.max(0, now() - started),
          });
          if (record) await options.cache.publish(record).catch(() => undefined);
          return record;
        },
        (error) => {
          observe({ operation: "document-load", outcome: "error", durationMs: Math.max(0, now() - started) });
          throw error;
        },
      )
      .finally(() => {
        if (loads.get(subjectIdentifier) === pending) loads.delete(subjectIdentifier);
      });
    loads.set(subjectIdentifier, pending);
    return pending;
  }
  return {
    async read(subjectIdentifier: string): Promise<DocumentFactsReadResult> {
      const started = now();
      const serialized = await options.cache.read(subjectIdentifier);
      let record: DocumentFactsCacheRecord | null = null;
      try {
        record = serialized === null ? null : DocumentFactsCacheRecordSchema.parse(JSON.parse(serialized));
      } catch {
        /* Read through malformed cache only. */
      }
      const hit = record?.subjectIdentifier === subjectIdentifier;
      observe({
        operation: "cache-read",
        outcome: hit ? "hit" : serialized === null ? "miss" : "invalid",
        durationMs: Math.max(0, now() - started),
      });
      if (!hit) record = await load(subjectIdentifier);
      return record === null ? { kind: "missing" } : readDocumentFactsRecord(JSON.stringify(record));
    },
  };
}
/** Consumer adapter for the neutral projection's existing facts-or-unavailable port. */
export function createSubjectFactsReader(options: CreateSubjectFactsReaderOptions) {
  const reader = createDocumentFactsReader(options);
  return {
    async read(subjectIdentifier: string) {
      const result = await reader.read(subjectIdentifier);
      return result.kind === "document" ? result.facts : null;
    },
  };
}
async function loadPublishedRecord(db: DbClient, subjectIdentifier: string) {
  const [row] = await db
    .select(publishedUserDocumentColumns)
    .from(userDocuments)
    .where(eq(userDocuments.subjectIdentifier, subjectIdentifier))
    .limit(1);
  if (!row || row.schemaVersion !== USER_DOCUMENT_SCHEMA_VERSION) return null;
  try {
    const record = createDocumentFactsCacheRecord(row);
    return record.subjectIdentifier === subjectIdentifier ? record : null;
  } catch {
    return null;
  }
}
