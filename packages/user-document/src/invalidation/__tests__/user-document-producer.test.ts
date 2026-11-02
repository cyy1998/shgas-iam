import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { UserDocumentJobPayload } from "@iam/contracts";
import { MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE, UserDocumentJobName, UserDocumentRebuildReason } from "@iam/contracts";
import { createUserDocumentJobProducer } from "../../producer";

test("chunks rebuild wakes while reporting target coverage to repair", async () => {
  const jobs: Array<{ name: UserDocumentJobName; data: UserDocumentJobPayload }> = [];
  const producer = createUserDocumentJobProducer(
    {
      async addBulk(batch) {
        jobs.push(...batch);
        return batch.map(({ opts }) => ({ id: opts.jobId }));
      },
    },
    { batchSize: 2 },
  );
  const requests = Array.from({ length: 5 }, (_, i) => ({
    userId: i + 1,
    version: "9007199254740993",
    reason: UserDocumentRebuildReason.OrganizationUpdated,
  }));
  const result = await producer.enqueueRebuildJobs(requests);
  expect(result.enqueued).toBe(5);
  expect(result.jobIds).toHaveLength(3);
  expect(jobs.map(({ name, data }) => ({ name, data }))).toEqual([
    { name: UserDocumentJobName.RebuildUserDocumentsBatch, data: { requests: requests.slice(0, 2) } },
    { name: UserDocumentJobName.RebuildUserDocumentsBatch, data: { requests: requests.slice(2, 4) } },
    { name: UserDocumentJobName.RebuildUserDocumentsBatch, data: { requests: requests.slice(4) } },
  ]);
});

test("caps rebuild requests per job and validates all inputs before enqueueing", async () => {
  const jobs: Array<{ data: UserDocumentJobPayload }> = [];
  const producer = createUserDocumentJobProducer(
    {
      async addBulk(batch) {
        jobs.push(...batch);
        return batch.map(({ opts }) => ({ id: opts.jobId }));
      },
    },
    { batchSize: MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE * 2 },
  );
  const requests = Array.from({ length: MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE + 1 }, (_, i) => ({
    userId: i + 1,
    version: "1",
    reason: UserDocumentRebuildReason.UserUpdated,
  }));
  await producer.enqueueRebuildJobs(requests);
  expect(jobs).toHaveLength(2);
  let error: unknown;
  try {
    await producer.enqueueRebuildJobs([
      ...requests,
      { userId: 0, version: "1", reason: UserDocumentRebuildReason.UserUpdated },
    ]);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  expect(jobs).toHaveLength(2);
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

test("preserves the User Document timeout error when using the shared transport", async () => {
  const producer = createUserDocumentJobProducer({ addBulk: () => new Promise(() => {}) }, { wakeUpTimeoutMs: 10 });
  const error = await producer.enqueueOutboxEntries([{ outboxId: randomUUID() }]).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ name: "UserDocumentWakeUpTimeoutError" });
});
