import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createOrganizationDocumentJobProducer } from "../jobs";

test("maps validated Outbox and rebuild payloads while preserving the owner report shape", async () => {
  const attempts: Array<{ name: string; data: unknown }> = [];
  const producer = createOrganizationDocumentJobProducer({
    async addBulk(jobs) {
      attempts.push(...jobs);
      return jobs;
    },
  });
  const change = { outboxId: randomUUID() };
  const rebuild = { organizationId: 7, version: "9007199254740993" };
  const outbox = await producer.enqueueOutboxEntries([change]);
  const documents = await producer.enqueueRebuilds([rebuild]);
  expect(outbox).toEqual({ enqueued: 1 });
  expect(documents).toEqual({ enqueued: 1 });
  expect(attempts.map(({ name, data }) => ({ name, data }))).toEqual([
    { name: "expand-outbox", data: change },
    { name: "rebuild-document", data: rebuild },
  ]);
  const empty = await producer.enqueueOutboxEntries([]);
  expect(empty).toEqual({ enqueued: 0 });
});

test("validates all payloads before giving any work to the shared transport", async () => {
  let calls = 0;
  const producer = createOrganizationDocumentJobProducer({
    async addBulk(jobs) {
      calls += 1;
      return jobs;
    },
  });
  const outboxError = await producer
    .enqueueOutboxEntries([{ outboxId: randomUUID() }, { outboxId: "invalid" }])
    .catch((error: unknown) => error);
  const rebuildError = await producer
    .enqueueRebuilds([
      { organizationId: 1, version: "1" },
      { organizationId: 2, version: "01" },
    ])
    .catch((error: unknown) => error);
  expect(outboxError).toBeInstanceOf(Error);
  expect(rebuildError).toBeInstanceOf(Error);
  expect(calls).toBe(0);
});

test("preserves the Organization Document timeout error when using the shared transport", async () => {
  const producer = createOrganizationDocumentJobProducer(
    { addBulk: () => new Promise(() => {}) },
    { wakeUpTimeoutMs: 10 },
  );
  const error = await producer.enqueueOutboxEntries([{ outboxId: randomUUID() }]).catch((caught: unknown) => caught);
  expect(error).toMatchObject({
    name: "OrganizationDocumentWakeUpTimeoutError",
    message: "Organization Document queue wake-up timed out",
  });
});
