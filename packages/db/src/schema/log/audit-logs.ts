import type { Json } from "drizzle-orm";
import { index, integer, jsonb, serial, snakeCase, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, jsonSchema } from "drizzle-orm/zod";

export const auditLogDetailsSchema = jsonSchema;

export const auditLogs = snakeCase.table("audit_log", {
  id: serial().primaryKey(),
  eventTime: timestamp({ precision: 0 }).notNull().defaultNow(),
  action: varchar({ length: 128 }).notNull(),
  outcome: varchar({ length: 16 }).notNull(),
  actorType: varchar({ length: 32 }).notNull(),
  actorUserId: integer(),
  actorUsername: varchar({ length: 64 }),
  actorClientCode: varchar({ length: 64 }),
  actorSystemKey: varchar({ length: 128 }),
  targetType: varchar({ length: 64 }).notNull(),
  targetId: integer(),
  targetCode: varchar({ length: 128 }),
  sourceApp: varchar({ length: 32 }).notNull(),
  requestId: varchar({ length: 128 }),
  traceId: varchar({ length: 128 }),
  ip: varchar({ length: 64 }),
  userAgent: varchar({ length: 512 }),
  route: varchar({ length: 255 }),
  method: varchar({ length: 16 }),
  details: jsonb().$type<Json>().notNull(),
}, table => [
  index("audit_log_event_time_idx").on(table.eventTime),
  index("audit_log_action_idx").on(table.action),
  index("audit_log_outcome_idx").on(table.outcome),
  index("audit_log_actor_user_idx").on(table.actorType, table.actorUserId),
  index("audit_log_actor_username_idx").on(table.actorType, table.actorUsername),
  index("audit_log_actor_client_code_idx").on(table.actorType, table.actorClientCode),
  index("audit_log_actor_system_key_idx").on(table.actorType, table.actorSystemKey),
  index("audit_log_target_id_idx").on(table.targetType, table.targetId),
  index("audit_log_target_code_idx").on(table.targetType, table.targetCode),
  index("audit_log_request_id_idx").on(table.requestId),
]);

export const selectAuditLogSchema = createSelectSchema(auditLogs, {
  details: () => auditLogDetailsSchema,
});
export const insertAuditLogSchema = createInsertSchema(auditLogs, {
  details: () => auditLogDetailsSchema,
}).omit({ id: true });
