import { UserStatus, UserType } from "@iam/contracts";
import { sql } from "drizzle-orm";
import { integer, snakeCase, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const USER_MOBILE_UNIQUE_INDEX = "user_mobile_phone_non_deleted_idx";
export const USER_WX_ID_UNIQUE_INDEX = "user_wx_id_non_deleted_idx";

export const users = snakeCase.table(
  "user",
  {
    id: baseColumns.id,
    subjectIdentifier: uuid().defaultRandom().notNull().unique("user_oidc_subject_key"),
    username: varchar({ length: 64 }).notNull().unique(),
    wxId: varchar("wxId", { length: 255 }),
    name: varchar({ length: 64 }).notNull(),
    password: varchar({ length: 255 }),
    mobile: varchar("mobile_phone", { length: 20 }),
    userType: varchar({ length: 20 }).$type<UserType>().notNull().default(UserType.Formal),
    orderNum: integer().notNull().default(999999),
    status: integer().$type<UserStatus>().notNull().default(UserStatus.Enable),
    isDelete: baseColumns.isDelete,
    createTime: baseColumns.createTime,
    updateTime: baseColumns.updateTime,
  },
  (table) => [
    uniqueIndex(USER_MOBILE_UNIQUE_INDEX)
      .on(table.mobile)
      .where(sql`${table.isDelete} = false AND ${table.mobile} IS NOT NULL`),
    uniqueIndex(USER_WX_ID_UNIQUE_INDEX)
      .on(table.wxId)
      .where(sql`${table.isDelete} = false AND ${table.wxId} IS NOT NULL`),
  ],
);

export const selectUserSchema = createSelectSchema(users, {
  userType: () => z.enum(UserType),
  status: () => z.enum(UserStatus),
});
export const insertUserSchema = createInsertSchema(users, {
  userType: () => z.enum(UserType),
  status: () => z.enum(UserStatus),
}).omit({ id: true, subjectIdentifier: true, createTime: true, updateTime: true, isDelete: true });
export const updateUserSchema = createUpdateSchema(users, {
  userType: () => z.enum(UserType),
  status: () => z.enum(UserStatus),
}).omit({ id: true, subjectIdentifier: true, createTime: true, updateTime: true, isDelete: true });

export type User = z.infer<typeof selectUserSchema>;
