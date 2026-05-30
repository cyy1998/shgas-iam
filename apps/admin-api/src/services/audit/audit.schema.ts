import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import {
  AuditActionSchema,
  AuditActorTypeSchema,
  AuditLogDtoSchema,
  AuditOutcomeSchema,
  AuditTargetTypeSchema,
} from "@iam/domain/audit";

export const AuditLogQueryConditionsSchema = z.object({
  action: AuditActionSchema.optional(),
  actions: z.array(AuditActionSchema).min(1).max(50).optional(),
  outcome: AuditOutcomeSchema.optional(),
  actorType: AuditActorTypeSchema.optional(),
  actorUserId: z.number().int().positive().optional(),
  actorUsername: z.string().min(1).max(64).optional(),
  actorClientCode: z.string().min(1).max(64).optional(),
  actorSystemKey: z.string().min(1).max(128).optional(),
  actorKeyword: z.string().min(1).max(128).optional(),
  targetType: AuditTargetTypeSchema.optional(),
  targetId: z.number().int().positive().optional(),
  targetCode: z.string().min(1).max(128).optional(),
  targetKeyword: z.string().min(1).max(128).optional(),
  requestId: z.string().min(1).max(128).optional(),
  eventTimeFrom: z.coerce.date().optional(),
  eventTimeTo: z.coerce.date().optional(),
}).openapi("AuditLogQueryConditions");

export const AuditLogPaginationQueryDtoSchema = createPageQuerySchema(AuditLogQueryConditionsSchema)
  .openapi("AuditLogPaginationQueryDto");

export { AuditLogDtoSchema };
