import { sql } from "drizzle-orm";
import { check, index, integer, snakeCase, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const USER_WECHAT_EXTERNAL_BINDING_UNIQUE_INDEX = "user_wechat_external_binding_active_identity_idx";

export const userWechatExternalBindings = snakeCase.table(
  "user_wechat_external_binding",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    corpId: text().notNull(),
    openId: text().notNull(),
    createTime: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex(USER_WECHAT_EXTERNAL_BINDING_UNIQUE_INDEX)
      .on(table.corpId, table.openId)
      .where(sql`${table.revokedAt} IS NULL`),
    index("user_wechat_external_binding_user_id_idx").on(table.userId),
    check("user_wechat_external_binding_open_id_length", sql`octet_length(${table.openId}) BETWEEN 1 AND 64`),
  ],
);
