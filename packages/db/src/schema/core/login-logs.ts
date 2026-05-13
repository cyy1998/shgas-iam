import { index, integer, serial, snakeCase, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";

export const loginLogs = snakeCase.table("login_log", {
  id: serial().primaryKey(),
  userId: integer().notNull(),
  username: varchar({ length: 64 }).notNull(),
  name: varchar({ length: 64 }).notNull(),
  clientCode: varchar({ length: 64 }).notNull(),
  loginType: varchar({ length: 64 }).notNull(),
  loginTime: timestamp({ precision: 0 }).notNull().defaultNow(),
}, table => [
  index("idx_user_id").on(table.userId),
  index("idx_username").on(table.username),
  index("idx_client_code").on(table.clientCode),
  index("idx_login_time").on(table.loginTime),
]);

export const selectLoginLogSchema = createSelectSchema(loginLogs);
export const insertLoginLogSchema = createInsertSchema(loginLogs);
export const updateLoginLogSchema = createUpdateSchema(loginLogs);
