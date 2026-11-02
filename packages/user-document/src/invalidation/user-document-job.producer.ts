import type {
  RebuildUserDocumentJobPayload,
  UserDocumentJobPayload,
  UserDocumentOutboxJobPayload,
} from "@iam/contracts";
import {
  MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE,
  RebuildUserDocumentJobPayloadSchema,
  UserDocumentJobName,
  UserDocumentOutboxJobPayloadSchema,
} from "@iam/contracts";
import { createJobWakeUpProducer, type JobWakeUpQueuePort } from "@iam/jobs";

export type UserDocumentRebuildJobQueuePort = JobWakeUpQueuePort<UserDocumentJobPayload, UserDocumentJobName>;

export function createUserDocumentJobProducer(
  queue: UserDocumentRebuildJobQueuePort,
  options: { batchSize?: number; wakeUpTimeoutMs?: number } = {},
) {
  const configuredSize = options.batchSize ?? MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE;
  if (!Number.isSafeInteger(configuredSize) || configuredSize < 1)
    throw new RangeError("User Document queue batch size must be a positive safe integer");
  const batchSize = Math.min(configuredSize, MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE);
  const transport = createJobWakeUpProducer(queue, {
    label: "User Document",
    timeoutErrorName: "UserDocumentWakeUpTimeoutError",
    wakeUpTimeoutMs: options.wakeUpTimeoutMs,
  });
  return {
    async enqueueOutboxEntries(inputs: UserDocumentOutboxJobPayload[]) {
      return await transport.enqueue(
        UserDocumentJobName.ExpandUserDocumentOutbox,
        inputs.map((input) => UserDocumentOutboxJobPayloadSchema.parse(input)),
      );
    },
    async enqueueRebuildJobs(inputs: RebuildUserDocumentJobPayload[]) {
      const requests = inputs.map((input) => RebuildUserDocumentJobPayloadSchema.parse(input));
      const payloads: UserDocumentJobPayload[] = [];
      for (let offset = 0; offset < requests.length; offset += batchSize)
        payloads.push({ requests: requests.slice(offset, offset + batchSize) });
      const result = await transport.enqueue(UserDocumentJobName.RebuildUserDocumentsBatch, payloads);
      // Repair reports target coverage; jobIds identifies the smaller set of transport wakes.
      return { enqueued: requests.length, jobIds: result.jobIds };
    },
  };
}
export type UserDocumentJobProducer = ReturnType<typeof createUserDocumentJobProducer>;
