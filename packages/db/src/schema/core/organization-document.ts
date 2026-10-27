import type { Json } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";

export type OrganizationDocumentWorkStatus = "pending" | "processing" | "processed" | "failed";
export type OrganizationDocumentSourceScope = "self" | "subtree";
export type OrganizationDocumentRebuildRequest = { targetId: number; version: string };

export const organizationDocumentOutboxEntries = snakeCase.table(
  "organization_document_outbox",
  {
    id: uuid().primaryKey(),
    organizationId: integer().notNull(),
    scope: text().$type<OrganizationDocumentSourceScope>().notNull(),
    status: text().$type<OrganizationDocumentWorkStatus>().notNull().default("pending"),
    processingToken: uuid(),
    processingStartedAt: timestamp(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    rebuildRequests: jsonb().$type<OrganizationDocumentRebuildRequest[]>().notNull().default([]),
    createdAt: timestamp().notNull().defaultNow(),
    processedAt: timestamp(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("organization_document_outbox_status_created_at_idx").on(table.status, table.createdAt),
    index("organization_document_outbox_status_processing_started_at_idx").on(table.status, table.processingStartedAt),
    check("organization_document_outbox_organization_id_positive_check", sql`${table.organizationId} > 0`),
    check("organization_document_outbox_scope_check", sql`${table.scope} IN ('self', 'subtree')`),
    check(
      "organization_document_outbox_status_check",
      sql`${table.status} IN ('pending', 'processing', 'processed', 'failed')`,
    ),
    check("organization_document_outbox_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "organization_document_outbox_processing_check",
      sql`(${table.status} = 'processing') = (${table.processingToken} IS NOT NULL AND ${table.processingStartedAt} IS NOT NULL)`,
    ),
    check("organization_document_outbox_requests_array_check", sql`jsonb_typeof(${table.rebuildRequests}) = 'array'`),
  ],
);

export const organizationDocumentRebuildStates = snakeCase.table(
  "organization_document_rebuild_state",
  {
    organizationId: integer().primaryKey(),
    version: bigint({ mode: "string" }).notNull().default("1"),
    status: text().$type<OrganizationDocumentWorkStatus>().notNull().default("pending"),
    processingToken: uuid(),
    processingStartedAt: timestamp(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    dirtyAt: timestamp().notNull().defaultNow(),
    processedAt: timestamp(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("organization_document_rebuild_state_status_dirty_at_idx").on(table.status, table.dirtyAt),
    index("organization_document_rebuild_state_processing_idx").on(table.status, table.processingStartedAt),
    check("organization_document_rebuild_state_target_positive_check", sql`${table.organizationId} > 0`),
    check("organization_document_rebuild_state_version_positive_check", sql`${table.version} > 0`),
    check(
      "organization_document_rebuild_state_status_check",
      sql`${table.status} IN ('pending', 'processing', 'processed', 'failed')`,
    ),
    check("organization_document_rebuild_state_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "organization_document_rebuild_state_processing_check",
      sql`(${table.status} = 'processing') = (${table.processingToken} IS NOT NULL AND ${table.processingStartedAt} IS NOT NULL)`,
    ),
  ],
);

export const organizationDocuments = snakeCase.table(
  "organization_document",
  {
    organizationId: integer().primaryKey(),
    document: jsonb().$type<Json>(),
    schemaVersion: integer().notNull(),
    sourceVersion: bigint({ mode: "string" }).notNull(),
    searchVisible: boolean().notNull(),
    rebuiltAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("organization_document_visible_schema_idx").on(table.searchVisible, table.schemaVersion),
    index("organization_document_document_gin_idx").using("gin", table.document),
    check("organization_document_organization_id_positive_check", sql`${table.organizationId} > 0`),
    check("organization_document_schema_version_positive_check", sql`${table.schemaVersion} > 0`),
    check("organization_document_source_version_positive_check", sql`${table.sourceVersion} > 0`),
    check(
      "organization_document_object_check",
      sql`${table.document} IS NULL OR jsonb_typeof(${table.document}) = 'object'`,
    ),
    check("organization_document_visibility_check", sql`${table.searchVisible} = (${table.document} IS NOT NULL)`),
  ],
);

export const selectOrganizationDocumentOutboxEntrySchema = createSelectSchema(organizationDocumentOutboxEntries);
export const selectOrganizationDocumentRebuildStateSchema = createSelectSchema(organizationDocumentRebuildStates);
export const selectOrganizationDocumentSchema = createSelectSchema(organizationDocuments);
