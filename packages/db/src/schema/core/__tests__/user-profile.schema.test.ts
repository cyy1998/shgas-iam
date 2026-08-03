import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { userProfileDirty } from "../user-profile-dirty";
import { userProfiles } from "../user-profiles";

function columnsByProperty(table: typeof userProfiles | typeof userProfileDirty) {
  return Object.fromEntries(getTableConfig(table).columns.map((column: any) => [column.name, column])) as Record<
    string,
    any
  >;
}

function indexesByName(table: typeof userProfiles | typeof userProfileDirty) {
  return Object.fromEntries(
    getTableConfig(table).indexes.map((index: any) => [index.config.name, index.config]),
  ) as Record<string, any>;
}

describe("user profile schema", () => {
  test("declares the tightened seventeen-column Subject Facts publication model", () => {
    const config = getTableConfig(userProfiles);
    const columns = columnsByProperty(userProfiles);

    expect(Object.keys(columns)).toEqual([
      "user_id",
      "subject_identifier",
      "username",
      "name",
      "mobile",
      "wx_id",
      "status",
      "is_delete",
      "search_visible",
      "profile_schema_version",
      "source_dirty_version",
      "detail",
      "search_doc",
      "subject_facts",
      "rebuilt_at",
      "create_time",
      "update_time",
    ]);
    expect(columns.subject_identifier).toMatchObject({ columnType: "PgUUID", notNull: true });
    expect(columns.name).toMatchObject({ columnType: "PgVarchar", notNull: true });
    expect(columns.source_dirty_version).toMatchObject({ columnType: "PgBigIntString", notNull: true });
    expect(columns.subject_facts).toMatchObject({ columnType: "PgJsonb", notNull: true });
    expect(config.checks.map(check => check.name).sort()).toEqual([
      "user_profile_source_dirty_version_positive_check",
      "user_profile_subject_facts_object_check",
    ]);
  });

  test("stores one current profile row per user with JSONB profile documents", () => {
    const columns = columnsByProperty(userProfiles);

    expect(columns.user_id.primary).toBe(true);
    expect(columns.user_id.name).toBe("user_id");
    expect(columns.profile_schema_version.notNull).toBe(true);
    expect(columns.search_visible.notNull).toBe(true);
    expect(columns.detail.columnType).toBe("PgJsonb");
    expect(columns.detail.notNull).toBe(true);
    expect(columns.search_doc.columnType).toBe("PgJsonb");
    expect(columns.search_doc.notNull).toBe(true);
    expect(columns.rebuilt_at.notNull).toBe(true);
  });

  test("declares identity BTREE indexes and a GIN index only for search_doc", () => {
    const indexes = indexesByName(userProfiles);

    expect(indexes.user_profile_username_idx).toMatchObject({ method: "btree" });
    expect(indexes.user_profile_username_idx.columns.map((column: any) => column.name)).toEqual(["username"]);
    expect(indexes.user_profile_mobile_idx.columns.map((column: any) => column.name)).toEqual(["mobile"]);
    expect(indexes.user_profile_wx_id_idx.columns.map((column: any) => column.name)).toEqual(["wx_id"]);
    expect(indexes.user_profile_visible_schema_version_idx.columns.map((column: any) => column.name)).toEqual([
      "search_visible",
      "profile_schema_version",
    ]);
    expect(indexes.user_profile_search_doc_gin_idx).toMatchObject({ method: "gin" });
    expect(indexes.user_profile_search_doc_gin_idx.columns.map((column: any) => column.name)).toEqual(["search_doc"]);
    expect(Object.values(indexes).some((index: any) =>
      index.method === "gin" && index.columns.some((column: any) => column.name === "detail"),
    )).toBe(false);
    expect(indexes.user_profile_subject_identifier_idx).toMatchObject({
      method: "btree",
      unique: true,
    });
    expect(indexes.user_profile_subject_identifier_idx.columns.map((column: any) => column.name))
      .toEqual(["subject_identifier"]);
    expect(Object.values(indexes).some((index: any) =>
      index.method === "gin"
      && index.columns.some((column: any) => column.name === "subject_facts"),
    )).toBe(false);
  });
});

describe("user profile dirty schema", () => {
  test("stores one durable rebuild state row per user", () => {
    const columns = columnsByProperty(userProfileDirty);
    const indexes = indexesByName(userProfileDirty);

    expect(columns.user_id.primary).toBe(true);
    expect(columns.dirty_version.columnType).toBe("PgBigIntString");
    expect(columns.dirty_version.notNull).toBe(true);
    expect(columns.dirty_version.hasDefault).toBe(true);
    expect(columns.status.notNull).toBe(true);
    expect(columns.status.hasDefault).toBe(true);
    expect(columns.reason_codes.columnType).toBe("PgJsonb");
    expect(columns.reason_codes.notNull).toBe(true);
    expect(columns.attempts.hasDefault).toBe(true);
    expect(columns.last_error.columnType).toBe("PgText");
    expect(columns.last_job_id.name).toBe("last_job_id");
    expect(indexes.user_profile_dirty_status_dirty_at_idx.columns.map((column: any) => column.name)).toEqual([
      "status",
      "dirty_at",
    ]);
    expect(indexes.user_profile_dirty_status_processing_started_at_idx.columns.map((column: any) => column.name))
      .toEqual([
        "status",
        "processing_started_at",
      ]);
  });
});
