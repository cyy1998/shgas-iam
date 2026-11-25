import { z } from "@hono/zod-openapi";
import {
  AuditActorSchema as ActorSchema,
  AuditActorTypeSchema as ActorTypeSchema,
  AuditActionSchema,
  AuditDetailsSchema,
  AuditLogWriteSchema,
  AuditTargetTypeSchema,
  AuditOutcomeSchema as OutcomeSchema,
  AuditRequestContextSchema as RequestContextSchema,
  AuditTargetSchema as TargetSchema,
} from "@iam/contracts/audit";
import { selectAuditLogSchema } from "@iam/db/schema";

export { AuditActionSchema, AuditDetailsSchema, AuditTargetTypeSchema };
// Contracts may be loaded before the OpenAPI extension initializes Zod.
export const AuditActorTypeSchema = ActorTypeSchema.clone().openapi("AuditActorType");
export const AuditOutcomeSchema = OutcomeSchema.clone().openapi("AuditOutcome");
export const AuditActorSchema = ActorSchema.clone().openapi("AuditActor");
export const AuditTargetSchema = TargetSchema.clone().openapi("AuditTarget");
export const AuditRequestContextSchema = RequestContextSchema.clone().openapi("AuditRequestContext");
export const AuditLogWriteDtoSchema = AuditLogWriteSchema.clone().openapi("AuditLogWriteDto");

export const AuditLogDtoSchema = z
  .object(selectAuditLogSchema.shape)
  .extend({
    action: AuditActionSchema,
    outcome: AuditOutcomeSchema,
    actorType: AuditActorTypeSchema,
    targetType: AuditTargetTypeSchema,
    details: AuditDetailsSchema,
  })
  .openapi("AuditLogDto");
