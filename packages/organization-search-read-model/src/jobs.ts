import { randomUUID } from "node:crypto";
import {
  ORGANIZATION_REBUILD_JOB_NAME,
  ORGANIZATION_SOURCE_CHANGE_JOB_NAME,
  type OrganizationRebuildJobPayload,
  OrganizationRebuildJobPayloadSchema,
  type OrganizationSearchJobProducerPort,
  type OrganizationSourceChangeJobPayload,
  OrganizationSourceChangeJobPayloadSchema,
} from "./work.types";

export type OrganizationSearchJobName =
  | typeof ORGANIZATION_SOURCE_CHANGE_JOB_NAME
  | typeof ORGANIZATION_REBUILD_JOB_NAME;
export type OrganizationSearchJobPayload = OrganizationSourceChangeJobPayload | OrganizationRebuildJobPayload;

export interface OrganizationSearchQueueProducerPort {
  addBulk: (
    jobs: Array<{ name: OrganizationSearchJobName; data: OrganizationSearchJobPayload; opts: { jobId: string } }>,
  ) => Promise<unknown[]>;
}

export function createOrganizationSearchJobProducer(
  queue: OrganizationSearchQueueProducerPort,
): OrganizationSearchJobProducerPort {
  async function enqueue(name: OrganizationSearchJobName, payloads: OrganizationSearchJobPayload[]) {
    if (payloads.length === 0) return { enqueued: 0 };
    const jobs = payloads.map((data) => ({ name, data, opts: { jobId: randomUUID() } }));
    const added = await queue.addBulk(jobs);
    return { enqueued: added.length };
  }

  return {
    async enqueueSourceChanges(payloads) {
      return await enqueue(
        ORGANIZATION_SOURCE_CHANGE_JOB_NAME,
        payloads.map((payload) => OrganizationSourceChangeJobPayloadSchema.parse(payload)),
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
