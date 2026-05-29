import { z } from "@hono/zod-openapi";
import { selectAuditLogSchema } from "@iam/db/schema";

export const AuditActorTypeSchema = z.enum(["user", "admin", "client", "system", "anonymous"]).openapi("AuditActorType");
export const AuditOutcomeSchema = z.enum(["success", "failure"]).openapi("AuditOutcome");
export const AuditActionSchema = z.string().min(3).max(128).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
export const AuditTargetTypeSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/);
export const AuditDetailsSchema = z.record(z.string(), z.unknown()).default({});

export const AuditActorSchema = z.object({
  actorType: AuditActorTypeSchema,
  actorUserId: z.number().int().positive().nullable().default(null),
  actorUsername: z.string().min(1).max(64).nullable().default(null),
  actorClientCode: z.string().min(1).max(64).nullable().default(null),
  actorSystemKey: z.string().min(1).max(128).nullable().default(null),
}).superRefine((actor, ctx) => {
  if ((actor.actorType === "user" || actor.actorType === "admin")
    && actor.actorUserId === null
    && actor.actorUsername === null) {
    ctx.addIssue({
      code: "custom",
      message: "user/admin actor requires actorUserId or actorUsername",
      path: ["actorUserId"],
    });
  }
  if (actor.actorType === "client" && actor.actorClientCode === null) {
    ctx.addIssue({
      code: "custom",
      message: "client actor requires actorClientCode",
      path: ["actorClientCode"],
    });
  }
  if (actor.actorType === "system" && actor.actorSystemKey === null) {
    ctx.addIssue({
      code: "custom",
      message: "system actor requires actorSystemKey",
      path: ["actorSystemKey"],
    });
  }
}).openapi("AuditActor");

export const AuditTargetSchema = z.object({
  targetType: AuditTargetTypeSchema,
  targetId: z.number().int().positive().nullable().default(null),
  targetCode: z.string().min(1).max(128).nullable().default(null),
}).openapi("AuditTarget");

export const AuditRequestContextSchema = z.object({
  sourceApp: z.string().min(1).max(32),
  requestId: z.string().min(1).max(128).nullable().default(null),
  traceId: z.string().min(1).max(128).nullable().default(null),
  ip: z.string().min(1).max(64).nullable().default(null),
  userAgent: z.string().min(1).max(512).nullable().default(null),
  route: z.string().min(1).max(255).nullable().default(null),
  method: z.string().min(1).max(16).nullable().default(null),
}).openapi("AuditRequestContext");

export const AuditLogDtoSchema = z.object(selectAuditLogSchema.shape).extend({
  action: AuditActionSchema,
  outcome: AuditOutcomeSchema,
  actorType: AuditActorTypeSchema,
  targetType: AuditTargetTypeSchema,
  details: AuditDetailsSchema,
}).openapi("AuditLogDto");

export const AuditLogWriteDtoSchema = z.object({
  eventTime: z.date().optional(),
  action: AuditActionSchema,
  outcome: AuditOutcomeSchema,
  details: AuditDetailsSchema.optional(),
  actorType: AuditActorTypeSchema,
  actorUserId: z.number().int().positive().nullable().default(null),
  actorUsername: z.string().min(1).max(64).nullable().default(null),
  actorClientCode: z.string().min(1).max(64).nullable().default(null),
  actorSystemKey: z.string().min(1).max(128).nullable().default(null),
  targetType: AuditTargetTypeSchema,
  targetId: z.number().int().positive().nullable().default(null),
  targetCode: z.string().min(1).max(128).nullable().default(null),
  sourceApp: z.string().min(1).max(32),
  requestId: z.string().min(1).max(128).nullable().default(null),
  traceId: z.string().min(1).max(128).nullable().default(null),
  ip: z.string().min(1).max(64).nullable().default(null),
  userAgent: z.string().min(1).max(512).nullable().default(null),
  route: z.string().min(1).max(255).nullable().default(null),
  method: z.string().min(1).max(16).nullable().default(null),
}).superRefine((write, ctx) => {
  if ((write.actorType === "user" || write.actorType === "admin")
    && write.actorUserId === null
    && write.actorUsername === null) {
    ctx.addIssue({
      code: "custom",
      message: "user/admin actor requires actorUserId or actorUsername",
      path: ["actorUserId"],
    });
  }
  if (write.actorType === "client" && write.actorClientCode === null) {
    ctx.addIssue({
      code: "custom",
      message: "client actor requires actorClientCode",
      path: ["actorClientCode"],
    });
  }
  if (write.actorType === "system" && write.actorSystemKey === null) {
    ctx.addIssue({
      code: "custom",
      message: "system actor requires actorSystemKey",
      path: ["actorSystemKey"],
    });
  }
}).openapi("AuditLogWriteDto");
