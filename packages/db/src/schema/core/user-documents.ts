import { type Json, sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, snakeCase, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema, jsonSchema } from "drizzle-orm/zod";
import { baseColumns } from "../_shard/base-columns";

export const userDocuments = snakeCase.table(
  "user_document",
  {
    userId: integer().primaryKey(),
    subjectIdentifier: uuid().notNull(),
    schemaVersion: integer().notNull(),
    sourceVersion: bigint({ mode: "string" }).notNull(),
    publishedAt: timestamp().notNull(),
    document: jsonb().$type<Json>(),
    createTime: baseColumns.createTime,
    updateTime: baseColumns.updateTime,
  },
  (table) => [
    uniqueIndex("user_document_subject_identifier_idx").on(table.subjectIdentifier),
    index("user_document_username_idx").on(sql`(${table.document}->'user'->>'username')`),
    index("user_document_schema_version_idx").on(table.schemaVersion),
    index("user_document_document_gin_idx").using("gin", table.document),
    check("user_document_source_version_positive_check", sql`${table.sourceVersion} > 0`),
    check(
      "user_document_document_object_check",
      sql`${table.document} IS NULL OR jsonb_typeof(${table.document}) = 'object'`,
    ),
  ],
);
export const selectUserDocumentSchema = createSelectSchema(userDocuments, { document: () => jsonSchema.nullable() });
export const insertUserDocumentSchema = createInsertSchema(userDocuments, {
  document: () => jsonSchema.nullable(),
}).omit({ createTime: true, updateTime: true });
export const updateUserDocumentSchema = createUpdateSchema(userDocuments, {
  document: () => jsonSchema.nullable(),
}).omit({ userId: true, createTime: true, updateTime: true });
export type UserDocumentRow = typeof userDocuments.$inferSelect;
