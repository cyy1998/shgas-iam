import type { z } from "@hono/zod-openapi";
import type {
  AuditActorSchema,
  AuditActorTypeSchema,
  AuditDetailsSchema,
  AuditLogDtoSchema,
  AuditLogWriteDtoSchema,
  AuditOutcomeSchema,
  AuditRequestContextSchema,
  AuditTargetSchema,
} from "./schema";

export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;
export type AuditDetails = z.infer<typeof AuditDetailsSchema>;
export type AuditActor = z.infer<typeof AuditActorSchema>;
export type AuditTarget = z.infer<typeof AuditTargetSchema>;
export type AuditRequestContext = z.infer<typeof AuditRequestContextSchema>;
export type AuditLogDto = z.infer<typeof AuditLogDtoSchema>;
export type AuditLogWriteDto = z.infer<typeof AuditLogWriteDtoSchema>;
