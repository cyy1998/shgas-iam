import type { Json } from "drizzle-orm";
import { UserStatus } from "@iam/contracts";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  snakeCase,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema, jsonSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export type UserProfileDetailDocument = Json;
export type UserProfileSearchDocument = Json;
export type UserProfileSubjectFactsDocument = Json;

export const userProfiles = snakeCase.table("user_profile", {
  userId: integer().primaryKey(),
  subjectIdentifier: uuid().notNull(),
  username: varchar({ length: 64 }).notNull(),
  name: varchar({ length: 64 }).notNull(),
  mobile: varchar({ length: 20 }),
  wxId: varchar({ length: 255 }),
  status: integer().$type<UserStatus>().notNull(),
  isDelete: boolean().notNull().default(false),
  searchVisible: boolean().notNull().default(false),
  profileSchemaVersion: integer().notNull(),
  sourceDirtyVersion: bigint({ mode: "string" }).notNull(),
  detail: jsonb().$type<UserProfileDetailDocument>().notNull(),
  searchDoc: jsonb().$type<UserProfileSearchDocument>().notNull(),
  subjectFacts: jsonb().$type<UserProfileSubjectFactsDocument>().notNull(),
  rebuiltAt: timestamp().notNull().defaultNow(),
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
}, table => [
  index("user_profile_username_idx").on(table.username),
  index("user_profile_mobile_idx").on(table.mobile),
  index("user_profile_wx_id_idx").on(table.wxId),
  index("user_profile_visible_schema_version_idx").on(table.searchVisible, table.profileSchemaVersion),
  index("user_profile_search_doc_gin_idx").using("gin", table.searchDoc),
  uniqueIndex("user_profile_subject_identifier_idx").on(table.subjectIdentifier),
  check(
    "user_profile_source_dirty_version_positive_check",
    sql`${table.sourceDirtyVersion} > 0`,
  ),
  check(
    "user_profile_subject_facts_object_check",
    sql`jsonb_typeof(${table.subjectFacts}) = 'object'`,
  ),
]);

export const selectUserProfileSchema = createSelectSchema(userProfiles, {
  status: () => z.enum(UserStatus),
  detail: () => jsonSchema,
  searchDoc: () => jsonSchema,
  subjectFacts: () => jsonSchema,
});
export const insertUserProfileSchema = createInsertSchema(userProfiles, {
  status: () => z.enum(UserStatus),
  detail: () => jsonSchema,
  searchDoc: () => jsonSchema,
  subjectFacts: () => jsonSchema,
}).omit({ createTime: true, updateTime: true });
export const updateUserProfileSchema = createUpdateSchema(userProfiles, {
  status: () => z.enum(UserStatus),
  detail: () => jsonSchema,
  searchDoc: () => jsonSchema,
  subjectFacts: () => jsonSchema,
}).omit({ userId: true, createTime: true, updateTime: true });

export type UserProfile = z.infer<typeof selectUserProfileSchema>;
