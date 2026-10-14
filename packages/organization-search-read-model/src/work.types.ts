import { z } from "zod";

export const ORGANIZATION_SEARCH_QUEUE_NAME = "organization-search";
export const ORGANIZATION_SOURCE_CHANGE_JOB_NAME = "expand-change";
export const ORGANIZATION_REBUILD_JOB_NAME = "rebuild-document";

export const OrganizationSourceChangeJobPayloadSchema = z.strictObject({ changeId: z.uuid() });
export const OrganizationRebuildJobPayloadSchema = z.strictObject({
  organizationId: z.number().int().positive(),
  version: z.string().regex(/^[1-9]\d*$/u),
});

export type OrganizationSourceChangeJobPayload = z.infer<typeof OrganizationSourceChangeJobPayloadSchema>;
export type OrganizationRebuildJobPayload = z.infer<typeof OrganizationRebuildJobPayloadSchema>;

export interface OrganizationSearchJobProducerPort {
  enqueueSourceChanges: (payloads: OrganizationSourceChangeJobPayload[]) => Promise<{ enqueued: number }>;
  enqueueRebuilds: (payloads: OrganizationRebuildJobPayload[]) => Promise<{ enqueued: number }>;
}

export interface OrganizationSearchClock {
  nowDate: () => Date;
}
