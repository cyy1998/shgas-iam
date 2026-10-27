import { UserDocumentRebuildReason, UserDocumentWorkStatus } from "@iam/contracts";
import { type Json, sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, snakeCase, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";

export const userDocumentRebuildStates = snakeCase.table(
  "user_document_rebuild_state",
  {
    userId: integer().primaryKey(),
    version: bigint("version", { mode: "string" }).notNull().default("1"),
    status: varchar({ length: 20 }).$type<UserDocumentWorkStatus>().notNull().default(UserDocumentWorkStatus.Pending),
    reasonCodes: jsonb().$type<UserDocumentRebuildReason[]>().notNull().default([]),
    dirtyAt: timestamp().notNull().defaultNow(),
    processingStartedAt: timestamp(),
    processingToken: uuid(),
    processedAt: timestamp(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    lastJobId: varchar({ length: 255 }),
    requestId: varchar({ length: 128 }),
    traceId: varchar({ length: 128 }),
    postPublicationVersion: bigint({ mode: "string" }),
    postPublicationStatus: text().$type<"pending" | "processing" | "processed" | "failed">(),
    postPublicationToken: uuid(),
    postPublicationStartedAt: timestamp(),
    postPublicationCompletedAt: timestamp(),
    postPublicationError: text(),
    postPublicationAttempts: integer().notNull().default(0),
    createTime: timestamp("created_at").notNull().defaultNow(),
    updateTime: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("user_document_rebuild_state_status_idx").on(table.status),
    index("user_document_rebuild_state_status_dirty_at_idx").on(table.status, table.dirtyAt),
    index("user_document_rebuild_state_status_processing_started_at_idx").on(table.status, table.processingStartedAt),
    index("user_document_rebuild_state_post_publication_idx").on(
      table.postPublicationStatus,
      table.postPublicationStartedAt,
    ),
    check("user_document_rebuild_state_version_positive_check", sql`${table.version} > 0`),
    check(
      "user_document_rebuild_state_processing_check",
      sql`(${table.status} = 'processing') = (${table.processingToken} IS NOT NULL AND ${table.processingStartedAt} IS NOT NULL)`,
    ),
    check(
      "user_document_rebuild_state_post_publication_check",
      sql`(${table.postPublicationStatus} IS NULL AND ${table.postPublicationVersion} IS NULL AND ${table.postPublicationToken} IS NULL AND ${table.postPublicationStartedAt} IS NULL) OR (${table.postPublicationStatus} IS NOT NULL AND ${table.postPublicationVersion} IS NOT NULL AND ${table.postPublicationVersion} > 0 AND ${table.postPublicationStatus} IN ('pending','processing','processed','failed') AND ((${table.postPublicationStatus} = 'processing') = (${table.postPublicationToken} IS NOT NULL AND ${table.postPublicationStartedAt} IS NOT NULL)))`,
    ),
  ],
);

export const selectUserDocumentRebuildStateSchema = createSelectSchema(userDocumentRebuildStates, {
  status: () => z.enum(UserDocumentWorkStatus),
  reasonCodes: () => z.array(z.enum(UserDocumentRebuildReason)),
});
export const insertUserDocumentRebuildStateSchema = createInsertSchema(userDocumentRebuildStates, {
  status: () => z.enum(UserDocumentWorkStatus),
  reasonCodes: () => z.array(z.enum(UserDocumentRebuildReason)),
}).omit({ createTime: true, updateTime: true });
export const updateUserDocumentRebuildStateSchema = createUpdateSchema(userDocumentRebuildStates, {
  status: () => z.enum(UserDocumentWorkStatus),
  reasonCodes: () => z.array(z.enum(UserDocumentRebuildReason)),
}).omit({ userId: true, createTime: true, updateTime: true });

export type UserDocumentRebuildState = z.infer<typeof selectUserDocumentRebuildStateSchema>;

export const userDocumentOutboxEntries = snakeCase.table(
  "user_document_outbox",
  {
    id: uuid().primaryKey(),
    source: jsonb().$type<Json>().notNull(),
    status: text().$type<"pending" | "processing" | "processed" | "failed">().notNull().default("pending"),
    processingToken: uuid(),
    processingStartedAt: timestamp(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    rebuildRequests: jsonb().$type<Array<{ targetId: number; version: string }>>().notNull().default([]),
    createdAt: timestamp().notNull().defaultNow(),
    processedAt: timestamp(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("user_document_outbox_status_created_at_idx").on(table.status, table.createdAt),
    index("user_document_outbox_processing_idx").on(table.status, table.processingStartedAt),
    index("user_document_outbox_source_gin_idx").using("gin", table.source),
    check("user_document_outbox_status_check", sql`${table.status} IN ('pending','processing','processed','failed')`),
    check(
      "user_document_outbox_processing_check",
      sql`(${table.status} = 'processing') = (${table.processingToken} IS NOT NULL AND ${table.processingStartedAt} IS NOT NULL)`,
    ),
    check("user_document_outbox_source_object_check", sql`jsonb_typeof(${table.source}) = 'object'`),
    check("user_document_outbox_requests_array_check", sql`jsonb_typeof(${table.rebuildRequests}) = 'array'`),
    check("user_document_outbox_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const selectUserDocumentOutboxEntrySchema = createSelectSchema(userDocumentOutboxEntries);
