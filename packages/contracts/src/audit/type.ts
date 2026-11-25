import type { z } from "zod";
import type { AuditActorSchema, AuditDetailsSchema, AuditLogWriteSchema, AuditRequestContextSchema } from "./schema";

export type AuditActor = z.output<typeof AuditActorSchema>;
export type AuditDetails = z.output<typeof AuditDetailsSchema>;
export type AuditRequestContext = z.output<typeof AuditRequestContextSchema>;
export type AuditLogWrite = z.output<typeof AuditLogWriteSchema>;

export type AuditLogInput = Omit<z.input<typeof AuditLogWriteSchema>, "sourceApp"> & {
  sourceApp?: string;
  actorName?: string | null;
  targetName?: string | null;
};
