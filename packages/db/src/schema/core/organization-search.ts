import type { Json } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";

export type OrganizationSearchWorkStatus = "pending" | "processing" | "processed" | "failed";
export type OrganizationSearchChangeScope = "self" | "subtree";
export type OrganizationSearchRebuildRequest = { organizationId: number; version: string };

export const organizationSearchChanges = snakeCase.table(
  "organization_search_change",
  {
    id: uuid().primaryKey(),
    organizationId: integer().notNull(),
    scope: text().$type<OrganizationSearchChangeScope>().notNull(),
    status: text().$type<OrganizationSearchWorkStatus>().notNull().default("pending"),
    processingToken: uuid(),
    processingStartedAt: timestamp(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    rebuildRequests: jsonb().$type<OrganizationSearchRebuildRequest[]>().notNull().default([]),
    createdAt: timestamp().notNull().defaultNow(),
    processedAt: timestamp(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("organization_search_change_status_created_at_idx").on(table.status, table.createdAt),
    index("organization_search_change_status_processing_started_at_idx").on(table.status, table.processingStartedAt),
    check("organization_search_change_organization_id_positive_check", sql`${table.organizationId} > 0`),
    check("organization_search_change_scope_check", sql`${table.scope} IN ('self', 'subtree')`),
    check(
      "organization_search_change_status_check",
      sql`${table.status} IN ('pending', 'processing', 'processed', 'failed')`,
    ),
    check("organization_search_change_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "organization_search_change_processing_check",
      sql`(${table.status} = 'processing') = (${table.processingToken} IS NOT NULL AND ${table.processingStartedAt} IS NOT NULL)`,
    ),
    check("organization_search_change_requests_array_check", sql`jsonb_typeof(${table.rebuildRequests}) = 'array'`),
  ],
);

export const organizationSearchDirty = snakeCase.table(
  "organization_search_dirty",
  {
    organizationId: integer().primaryKey(),
    version: bigint({ mode: "string" }).notNull().default("1"),
    status: text().$type<OrganizationSearchWorkStatus>().notNull().default("pending"),
    processingToken: uuid(),
    processingStartedAt: timestamp(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    dirtyAt: timestamp().notNull().defaultNow(),
    processedAt: timestamp(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("organization_search_dirty_status_dirty_at_idx").on(table.status, table.dirtyAt),
    index("organization_search_dirty_status_processing_started_at_idx").on(table.status, table.processingStartedAt),
    check("organization_search_dirty_organization_id_positive_check", sql`${table.organizationId} > 0`),
    check("organization_search_dirty_version_positive_check", sql`${table.version} > 0`),
    check(
      "organization_search_dirty_status_check",
      sql`${table.status} IN ('pending', 'processing', 'processed', 'failed')`,
    ),
    check("organization_search_dirty_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "organization_search_dirty_processing_check",
      sql`(${table.status} = 'processing') = (${table.processingToken} IS NOT NULL AND ${table.processingStartedAt} IS NOT NULL)`,
    ),
  ],
);

export const organizationSearchDocuments = snakeCase.table(
  "organization_search_document",
  {
    organizationId: integer().primaryKey(),
    document: jsonb().$type<Json>(),
    schemaVersion: integer().notNull(),
    sourceVersion: bigint({ mode: "string" }).notNull(),
    searchVisible: boolean().notNull(),
    rebuiltAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("organization_search_document_visible_schema_idx").on(table.searchVisible, table.schemaVersion),
    index("organization_search_document_document_gin_idx").using("gin", table.document),
    check("organization_search_document_organization_id_positive_check", sql`${table.organizationId} > 0`),
    check("organization_search_document_schema_version_positive_check", sql`${table.schemaVersion} > 0`),
    check("organization_search_document_source_version_positive_check", sql`${table.sourceVersion} > 0`),
    check(
      "organization_search_document_object_check",
      sql`${table.document} IS NULL OR jsonb_typeof(${table.document}) = 'object'`,
    ),
    check(
      "organization_search_document_visibility_check",
      sql`${table.searchVisible} = (${table.document} IS NOT NULL)`,
    ),
  ],
);

export const selectOrganizationSearchChangeSchema = createSelectSchema(organizationSearchChanges);
export const selectOrganizationSearchDirtySchema = createSelectSchema(organizationSearchDirty);
export const selectOrganizationSearchDocumentSchema = createSelectSchema(organizationSearchDocuments);
