import { randomUUID } from "node:crypto";
import {
  ORGANIZATION_OUTBOX_JOB_NAME,
  ORGANIZATION_REBUILD_JOB_NAME,
  type OrganizationDocumentJobProducerPort,
  type OrganizationOutboxJobPayload,
  OrganizationOutboxJobPayloadSchema,
  type OrganizationRebuildJobPayload,
  OrganizationRebuildJobPayloadSchema,
} from "./work.types";

export type OrganizationDocumentJobName = typeof ORGANIZATION_OUTBOX_JOB_NAME | typeof ORGANIZATION_REBUILD_JOB_NAME;
export type OrganizationDocumentJobPayload = OrganizationOutboxJobPayload | OrganizationRebuildJobPayload;

export interface OrganizationDocumentQueueProducerPort {
  addBulk: (
    jobs: Array<{ name: OrganizationDocumentJobName; data: OrganizationDocumentJobPayload; opts: { jobId: string } }>,
  ) => Promise<unknown[]>;
}

export function createOrganizationDocumentJobProducer(
  queue: OrganizationDocumentQueueProducerPort,
): OrganizationDocumentJobProducerPort {
  async function enqueue(name: OrganizationDocumentJobName, payloads: OrganizationDocumentJobPayload[]) {
    if (payloads.length === 0) return { enqueued: 0 };
    const jobs = payloads.map((data) => ({ name, data, opts: { jobId: randomUUID() } }));
    const added = await queue.addBulk(jobs);
    return { enqueued: added.length };
  }

  return {
    async enqueueOutboxEntries(payloads) {
      return await enqueue(
        ORGANIZATION_OUTBOX_JOB_NAME,
        payloads.map((payload) => OrganizationOutboxJobPayloadSchema.parse(payload)),
      );
    },
    async enqueueRebuilds(payloads) {
      return await enqueue(
        ORGANIZATION_REBUILD_JOB_NAME,
        payloads.map((payload) => OrganizationRebuildJobPayloadSchema.parse(payload)),
      );
    },
  };
}
