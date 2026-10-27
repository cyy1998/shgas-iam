import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { UserDocumentJobPayload } from "@iam/contracts";
import { UserDocumentJobName, UserDocumentRebuildReason } from "@iam/contracts";
import { createUserDocumentJobProducer } from "../../producer";

test("repeated durable work gets distinct queue wakes without changing its processing version", async () => {
  const jobs: Array<{ name: UserDocumentJobName; data: UserDocumentJobPayload; opts: { jobId: string } }> = [];
  const producer = createUserDocumentJobProducer({
    async addBulk(batch) {
      jobs.push(...batch);
      return batch.map(({ opts }) => ({ id: opts.jobId }));
    },
  });
  const payload = { userId: 123, version: "9007199254740993", reason: UserDocumentRebuildReason.UserUpdated };
  const first = await producer.enqueueRebuildJobs([payload]);
  const retry = await producer.enqueueRebuildJobs([payload]);
  expect(first.enqueued).toBe(1);
  expect(retry.enqueued).toBe(1);
  expect(retry.jobIds[0]).not.toBe(first.jobIds[0]);
  expect(jobs.map(({ data }) => data)).toEqual([payload, payload]);
});

test("queues only validated Outbox identities and keeps invalid rebuilds out of the transport", async () => {
  const jobs: Array<{ name: UserDocumentJobName; data: UserDocumentJobPayload }> = [];
  const producer = createUserDocumentJobProducer({
    async addBulk(batch) {
      jobs.push(...batch);
      return batch.map(({ opts }) => ({ id: opts.jobId }));
    },
  });
  const outboxId = randomUUID();
  const accepted = await producer.enqueueOutboxEntries([{ outboxId }]);
  let failure: unknown;
  try {
    await producer.enqueueRebuildJobs([{ userId: 0, version: "1", reason: UserDocumentRebuildReason.UserUpdated }]);
  } catch (error) {
    failure = error;
  }
  expect(accepted.enqueued).toBe(1);
  expect(failure).toBeInstanceOf(Error);
  expect(jobs.map(({ name, data }) => ({ name, data }))).toEqual([
    { name: UserDocumentJobName.ExpandUserDocumentOutbox, data: { outboxId } },
  ]);
});
