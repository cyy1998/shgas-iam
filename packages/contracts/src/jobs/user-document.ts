import { z } from "zod";

export const USER_DOCUMENT_QUEUE_NAME = "user-document";

export enum UserDocumentJobName {
  ExpandUserDocumentOutbox = "expand-user-document-outbox",
  RebuildUserDocument = "rebuild-user-document",
}

export enum UserDocumentRebuildReason {
  UserUpdated = "user-updated",
  EmploymentUpdated = "employment-updated",
  OrganizationResponsibilityAssignmentUpdated = "organization-responsibility-assignment-updated",
  OrganizationUpdated = "organization-updated",
  PositionUpdated = "position-updated",
  RoleUpdated = "role-updated",
  ManualRebuild = "manual-rebuild",
  Backfill = "backfill",
}

export enum UserDocumentWorkStatus {
  Pending = "pending",
  Processing = "processing",
  Processed = "processed",
  Failed = "failed",
}

const UserDocumentJobMetaSchema = z.object({
  reason: z.enum(UserDocumentRebuildReason),
  requestedAt: z.string().datetime().optional(),
  requestId: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(128).optional(),
});
const DocumentVersionSchema = z.string().regex(/^[1-9]\d*$/u, "version must be a positive decimal string");

export const UserDocumentJobNameSchema = z.enum(UserDocumentJobName);
export const UserDocumentRebuildReasonSchema = z.enum(UserDocumentRebuildReason);
export const UserDocumentWorkStatusSchema = z.enum(UserDocumentWorkStatus);

export const RebuildUserDocumentJobPayloadSchema = UserDocumentJobMetaSchema.extend({
  userId: z.number().int().positive(),
  version: DocumentVersionSchema,
}).strict();

export type RebuildUserDocumentJobPayload = z.infer<typeof RebuildUserDocumentJobPayloadSchema>;

export const UserDocumentOutboxJobPayloadSchema = z.strictObject({ outboxId: z.uuid() });
export type UserDocumentOutboxJobPayload = z.infer<typeof UserDocumentOutboxJobPayloadSchema>;
export type UserDocumentJobPayload = RebuildUserDocumentJobPayload | UserDocumentOutboxJobPayload;
