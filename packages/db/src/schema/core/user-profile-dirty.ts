import { UserProfileDirtyReason, UserProfileDirtyStatus } from "@iam/contracts";
import { index, integer, jsonb, snakeCase, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const userProfileDirty = snakeCase.table("user_profile_dirty", {
  userId: integer().primaryKey(),
  status: varchar({ length: 20 }).$type<UserProfileDirtyStatus>().notNull().default(UserProfileDirtyStatus.Pending),
  reasonCodes: jsonb().$type<UserProfileDirtyReason[]>().notNull().default([]),
  dirtyAt: timestamp().notNull().defaultNow(),
  processingStartedAt: timestamp(),
  processedAt: timestamp(),
  attempts: integer().notNull().default(0),
  lastError: text(),
  lastJobId: varchar({ length: 255 }),
  createTime: baseColumns.createTime,
  updateTime: baseColumns.updateTime,
}, table => [
  index("user_profile_dirty_status_idx").on(table.status),
  index("user_profile_dirty_status_dirty_at_idx").on(table.status, table.dirtyAt),
  index("user_profile_dirty_processing_started_at_idx").on(table.processingStartedAt),
]);

export const selectUserProfileDirtySchema = createSelectSchema(userProfileDirty, {
  status: () => z.enum(UserProfileDirtyStatus),
  reasonCodes: () => z.array(z.enum(UserProfileDirtyReason)),
});
export const insertUserProfileDirtySchema = createInsertSchema(userProfileDirty, {
  status: () => z.enum(UserProfileDirtyStatus),
  reasonCodes: () => z.array(z.enum(UserProfileDirtyReason)),
}).omit({ createTime: true, updateTime: true });
export const updateUserProfileDirtySchema = createUpdateSchema(userProfileDirty, {
  status: () => z.enum(UserProfileDirtyStatus),
  reasonCodes: () => z.array(z.enum(UserProfileDirtyReason)),
}).omit({ userId: true, createTime: true, updateTime: true });

export type UserProfileDirty = z.infer<typeof selectUserProfileDirtySchema>;
