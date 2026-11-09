import { z } from "zod";

export const ORGANIZATION_DOCUMENT_QUEUE_NAME = "organization-document";
export const ORGANIZATION_OUTBOX_JOB_NAME = "expand-outbox";
export const ORGANIZATION_REBUILD_JOB_NAME = "rebuild-document";

export const OrganizationOutboxJobPayloadSchema = z.strictObject({ outboxId: z.uuid() });
export const OrganizationRebuildJobPayloadSchema = z.strictObject({
  organizationId: z.number().int().positive(),
  version: z.string().regex(/^[1-9]\d*$/u),
});

export type OrganizationOutboxJobPayload = z.infer<typeof OrganizationOutboxJobPayloadSchema>;
export type OrganizationRebuildJobPayload = z.infer<typeof OrganizationRebuildJobPayloadSchema>;

export interface OrganizationDocumentJobProducerPort {
  enqueueOutboxEntries: (payloads: OrganizationOutboxJobPayload[]) => Promise<{ enqueued: number }>;
  enqueueRebuilds: (payloads: OrganizationRebuildJobPayload[]) => Promise<{ enqueued: number }>;
}

export interface OrganizationDocumentClock {
  nowDate: () => Date;
}
