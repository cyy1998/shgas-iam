import type { z } from "zod";
import { UserStatus } from "@iam/contracts";
import { boolean, integer, serial, snakeCase, timestamp, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";

export const users = snakeCase.table("user", {
  id: serial().primaryKey(),
  username: varchar({ length: 64 }).notNull().unique(),
  wxId: varchar("wxId", { length: 255 }),
  name: varchar({ length: 64 }).notNull(),
  password: varchar({ length: 255 }),
  mobile: varchar("mobile_phone", { length: 20 }),
  userType: varchar({ length: 20 }).notNull().default("正式员工"),
  orderNum: integer().notNull().default(999999),
  status: integer().$type<UserStatus>().notNull().default(UserStatus.Enable),
  isDelete: boolean().notNull().default(false),
  createTime: timestamp({ precision: 0 }).notNull().defaultNow(),
  updateTime: timestamp({ precision: 0 }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const selectUserSchema = createSelectSchema(users);

export type User = z.infer<typeof selectUserSchema>;
