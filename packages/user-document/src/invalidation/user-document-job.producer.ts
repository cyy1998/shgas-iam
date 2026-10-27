import { randomUUID } from "node:crypto";
import type {
  RebuildUserDocumentJobPayload,
  UserDocumentJobPayload,
  UserDocumentOutboxJobPayload,
} from "@iam/contracts";
import {
  RebuildUserDocumentJobPayloadSchema,
  UserDocumentJobName,
  UserDocumentOutboxJobPayloadSchema,
} from "@iam/contracts";

export interface UserDocumentRebuildJobQueuePort {
  addBulk: (
    jobs: Array<{ name: UserDocumentJobName; data: UserDocumentJobPayload; opts: { jobId: string } }>,
  ) => Promise<Array<{ id?: string }>>;
}

export function createUserDocumentJobProducer(queue: UserDocumentRebuildJobQueuePort) {
  async function enqueue(name: UserDocumentJobName, payloads: UserDocumentJobPayload[]) {
    const jobs = payloads.map((data) => ({ name, data, opts: { jobId: randomUUID() } }));
    const added: Array<{ id?: string }> = [];
    for (let offset = 0; offset < jobs.length; offset += 500)
      added.push(...(await queue.addBulk(jobs.slice(offset, offset + 500))));
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
      return await enqueue(
        UserDocumentJobName.RebuildUserDocument,
        inputs.map((input) => RebuildUserDocumentJobPayloadSchema.parse(input)),
      );
    },
  };
}
export type UserDocumentJobProducer = ReturnType<typeof createUserDocumentJobProducer>;
