import { createJobWakeUpProducer, type JobWakeUpQueuePort } from "@iam/jobs";
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
export type OrganizationDocumentQueueProducerPort = JobWakeUpQueuePort<
  OrganizationDocumentJobPayload,
  OrganizationDocumentJobName
>;

export function createOrganizationDocumentJobProducer(
  queue: OrganizationDocumentQueueProducerPort,
  options: { wakeUpTimeoutMs?: number } = {},
): OrganizationDocumentJobProducerPort {
  const transport = createJobWakeUpProducer(queue, {
    label: "Organization Document",
    timeoutErrorName: "OrganizationDocumentWakeUpTimeoutError",
    wakeUpTimeoutMs: options.wakeUpTimeoutMs,
  });
  return {
    async enqueueOutboxEntries(payloads) {
      const result = await transport.enqueue(
        ORGANIZATION_OUTBOX_JOB_NAME,
        payloads.map((payload) => OrganizationOutboxJobPayloadSchema.parse(payload)),
      );
      return { enqueued: result.enqueued };
    },
    async enqueueRebuilds(payloads) {
      const result = await transport.enqueue(
        ORGANIZATION_REBUILD_JOB_NAME,
        payloads.map((payload) => OrganizationRebuildJobPayloadSchema.parse(payload)),
      );
      return { enqueued: result.enqueued };
    },
  };
}
