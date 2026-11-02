import { randomUUID } from "node:crypto";
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

export interface UserDocumentRebuildJobQueuePort {
  addBulk: (
    jobs: Array<{ name: UserDocumentJobName; data: UserDocumentJobPayload; opts: { jobId: string } }>,
  ) => Promise<Array<{ id?: string }>>;
}

export function createUserDocumentJobProducer(
  queue: UserDocumentRebuildJobQueuePort,
  options: { batchSize?: number } = {},
) {
  const configuredSize = options.batchSize ?? MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE;
  if (!Number.isSafeInteger(configuredSize) || configuredSize < 1)
    throw new RangeError("User Document queue batch size must be a positive safe integer");
  const batchSize = Math.min(configuredSize, MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE);
  async function enqueue(name: UserDocumentJobName, payloads: UserDocumentJobPayload[]) {
    const jobs = payloads.map((data) => ({ name, data, opts: { jobId: randomUUID() } }));
    const added: Array<{ id?: string }> = [];
    for (let offset = 0; offset < jobs.length; offset += 500) {
      const batch = jobs.slice(offset, offset + 500);
      const result = await queue.addBulk(batch);
      if (result.length !== batch.length) throw new Error("User Document queue did not acknowledge every wake");
      added.push(...result);
    }
    return { enqueued: added.length, jobIds: added.map((job, index) => job.id ?? jobs[index]!.opts.jobId) };
  }
  return {
    async enqueueOutboxEntries(inputs: UserDocumentOutboxJobPayload[]) {
      return await enqueue(
        UserDocumentJobName.ExpandUserDocumentOutbox,
        inputs.map((input) => UserDocumentOutboxJobPayloadSchema.parse(input)),
      );
    },
    async enqueueRebuildJobs(inputs: RebuildUserDocumentJobPayload[]) {
      const requests = inputs.map((input) => RebuildUserDocumentJobPayloadSchema.parse(input));
      const payloads: UserDocumentJobPayload[] = [];
      for (let offset = 0; offset < requests.length; offset += batchSize)
        payloads.push({ requests: requests.slice(offset, offset + batchSize) });
      const result = await enqueue(UserDocumentJobName.RebuildUserDocumentsBatch, payloads);
      // Repair reports target coverage; jobIds identifies the smaller set of transport wakes.
      return { enqueued: requests.length, jobIds: result.jobIds };
    },
  };
}
export type UserDocumentJobProducer = ReturnType<typeof createUserDocumentJobProducer>;
