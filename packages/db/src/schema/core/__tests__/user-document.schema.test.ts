import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { userDocumentRebuildStates } from "../user-document-rebuild-state";
import { userDocuments } from "../user-documents";

function columnsByProperty(table: typeof userDocuments | typeof userDocumentRebuildStates) {
  return Object.fromEntries(getTableConfig(table).columns.map((column: any) => [column.name, column])) as Record<
    string,
    any
  >;
}

function indexesByName(table: typeof userDocuments | typeof userDocumentRebuildStates) {
  return Object.fromEntries(
    getTableConfig(table).indexes.map((index: any) => [index.config.name, index.config]),
  ) as Record<string, any>;
}

describe("canonical User Document storage", () => {
  test("keeps only identity, publication metadata and one nullable JSON business document", () => {
    const config = getTableConfig(userDocuments),
      columns = columnsByProperty(userDocuments);
    expect(Object.keys(columns)).toEqual([
      "user_id",
      "subject_identifier",
      "schema_version",
      "source_version",
      "published_at",
      "document",
      "create_time",
      "update_time",
    ]);
    expect(columns.user_id.primary).toBe(true);
    expect(columns.subject_identifier.notNull).toBe(true);
    expect(columns.source_version).toMatchObject({ columnType: "PgBigIntString", notNull: true });
    expect(columns.document).toMatchObject({ columnType: "PgJsonb", notNull: false });
    expect(config.checks.map((check) => check.name).sort()).toEqual([
      "user_document_document_object_check",
      "user_document_source_version_positive_check",
    ]);
    const indexes = indexesByName(userDocuments);
    expect(indexes.user_document_subject_identifier_idx).toMatchObject({ unique: true, method: "btree" });
    expect(indexes.user_document_document_gin_idx).toMatchObject({ method: "gin" });
  });
});

describe("user document dirty schema", () => {
  test("stores one durable rebuild state row per user", () => {
    const columns = columnsByProperty(userDocumentRebuildStates);
    const indexes = indexesByName(userDocumentRebuildStates);

    expect(columns.user_id.primary).toBe(true);
    expect(columns.version.columnType).toBe("PgBigIntString");
    expect(columns.version.notNull).toBe(true);
    expect(columns.version.hasDefault).toBe(true);
    expect(columns.status.notNull).toBe(true);
    expect(columns.status.hasDefault).toBe(true);
    expect(columns.reason_codes.columnType).toBe("PgJsonb");
    expect(columns.reason_codes.notNull).toBe(true);
    expect(columns.attempts.hasDefault).toBe(true);
    expect(columns.last_error.columnType).toBe("PgText");
    expect(columns.last_job_id.name).toBe("last_job_id");
    expect(indexes.user_document_rebuild_state_status_dirty_at_idx.columns.map((column: any) => column.name)).toEqual([
      "status",
      "dirty_at",
    ]);
    expect(
      indexes.user_document_rebuild_state_status_processing_started_at_idx.columns.map((column: any) => column.name),
    ).toEqual(["status", "processing_started_at"]);
  });
});
