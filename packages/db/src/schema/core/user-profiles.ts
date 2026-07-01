import type { Json } from "drizzle-orm";
import { UserStatus } from "@iam/contracts";
import { boolean, index, integer, jsonb, snakeCase, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema, jsonSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export type UserProfileDetailDocument = Json;
export type UserProfileSearchDocument = Json;

export const userProfiles = snakeCase.table("user_profile", {
  userId: integer().primaryKey(),
  username: varchar({ length: 64 }).notNull(),
  mobile: varchar({ length: 20 }),
  wxId: varchar({ length: 255 }),
  status: integer().$type<UserStatus>().notNull(),
  isDelete: boolean().notNull().default(false),
  searchVisible: boolean().notNull().default(false),
  profileSchemaVersion: integer().notNull(),
  detail: jsonb().$type<UserProfileDetailDocument>().notNull(),
  searchDoc: jsonb().$type<UserProfileSearchDocument>().notNull(),
  rebuiltAt: timestamp().notNull().defaultNow(),
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
}, table => [
  index("user_profile_username_idx").on(table.username),
  index("user_profile_mobile_idx").on(table.mobile),
  index("user_profile_wx_id_idx").on(table.wxId),
  index("user_profile_visible_schema_version_idx").on(table.searchVisible, table.profileSchemaVersion),
  index("user_profile_search_doc_gin_idx").using("gin", table.searchDoc),
]);

export const selectUserProfileSchema = createSelectSchema(userProfiles, {
  status: () => z.enum(UserStatus),
  detail: () => jsonSchema,
  searchDoc: () => jsonSchema,
});
export const insertUserProfileSchema = createInsertSchema(userProfiles, {
  status: () => z.enum(UserStatus),
  detail: () => jsonSchema,
  searchDoc: () => jsonSchema,
}).omit({ createTime: true, updateTime: true });
export const updateUserProfileSchema = createUpdateSchema(userProfiles, {
  status: () => z.enum(UserStatus),
  detail: () => jsonSchema,
  searchDoc: () => jsonSchema,
}).omit({ userId: true, createTime: true, updateTime: true });

export type UserProfile = z.infer<typeof selectUserProfileSchema>;
