import { UserStatus, UserType } from "@iam/contracts";
import { integer, snakeCase, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { baseColumns } from "../_shard/base-columns";

export const users = snakeCase.table("user", {
  id: baseColumns.id,
  oidcSubject: uuid().defaultRandom().notNull().unique(),
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
});

export const selectUserSchema = createSelectSchema(users, {
  userType: () => z.enum(UserType),
  status: () => z.enum(UserStatus),
});
export const insertUserSchema = createInsertSchema(users, {
  userType: () => z.enum(UserType),
  status: () => z.enum(UserStatus),
}).omit({ id: true, oidcSubject: true, createTime: true, updateTime: true, isDelete: true });
export const updateUserSchema = createUpdateSchema(users, {
  userType: () => z.enum(UserType),
  status: () => z.enum(UserStatus),
}).omit({ id: true, oidcSubject: true, createTime: true, updateTime: true, isDelete: true });

export type User = z.infer<typeof selectUserSchema>;
