import { expect, spyOn, test } from "bun:test";
import { createJobWakeUpProducer } from "../index";

const options = { label: "Document", timeoutErrorName: "DocumentWakeUpTimeoutError" };

test("repeated durable work receives distinct random queue identities", async () => {
  const producer = createJobWakeUpProducer<number, "rebuild">({ addBulk: async (jobs) => jobs }, options);
  const first = await producer.enqueue("rebuild", [7]);
  const retry = await producer.enqueue("rebuild", [7]);
  expect(first.enqueued).toBe(1);
  expect(retry.enqueued).toBe(1);
  expect(retry.jobIds[0]).not.toBe(first.jobIds[0]);
});

test("splits transport into at most 500 jobs and preserves payload order and coverage", async () => {
  const batchSizes: number[] = [];
  const observed: number[] = [];
  const producer = createJobWakeUpProducer<number, "rebuild">(
    {
      async addBulk(jobs) {
        batchSizes.push(jobs.length);
        observed.push(...jobs.map(({ data }) => data));
        return jobs;
      },
    },
    options,
  );
  const inputs = Array.from({ length: 1_001 }, (_, index) => index);
  const result = await producer.enqueue("rebuild", inputs);
  expect(result.enqueued).toBe(1_001);
  expect(result.jobIds).toHaveLength(1_001);
  expect(batchSizes).toEqual([500, 500, 1]);
  expect(observed).toEqual(inputs);
});

test("returns acknowledged IDs and falls back to the sent identity for opaque acknowledgments", async () => {
  const sentIds: string[] = [];
  const producer = createJobWakeUpProducer<number, "rebuild">(
    {
      async addBulk(jobs) {
        sentIds.push(...jobs.map(({ opts }) => opts.jobId));
        return [{ id: "acknowledged-id" }, null, {}, { id: 42 }];
      },
    },
    options,
  );
  const result = await producer.enqueue("rebuild", [1, 2, 3, 4]);
  expect(result.jobIds).toEqual(["acknowledged-id", ...sentIds.slice(1)]);
});

test("bounds a wake-up even when the queue never replies", async () => {
  const producer = createJobWakeUpProducer<number, "rebuild">(
    { addBulk: () => new Promise(() => {}) },
    { ...options, wakeUpTimeoutMs: 10 },
  );
  const error = await producer.enqueue("rebuild", [1]).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ name: "DocumentWakeUpTimeoutError", message: "Document queue wake-up timed out" });
});

test("shares one deadline across every transport batch", async () => {
  let elapsed = 0;
  let calls = 0;
  const now = spyOn(performance, "now").mockImplementation(() => elapsed);
  try {
    const producer = createJobWakeUpProducer<number, "rebuild">(
      {
        async addBulk(jobs) {
          calls += 1;
          elapsed += 40;
          return jobs;
        },
      },
      { ...options, wakeUpTimeoutMs: 60 },
    );
    const error = await producer
      .enqueue(
        "rebuild",
        Array.from({ length: 1_001 }, (_, index) => index),
      )
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "DocumentWakeUpTimeoutError" });
    expect(calls).toBe(2);
  } finally {
    now.mockRestore();
  }
});

test("late successful delivery cannot dispatch another batch after timeout", async () => {
  const reply = Promise.withResolvers<unknown[]>();
  const firstBatch: unknown[] = [];
  let calls = 0;
  const producer = createJobWakeUpProducer<number, "rebuild">(
    {
      addBulk(jobs) {
        calls += 1;
        firstBatch.push(...jobs);
        return reply.promise;
      },
    },
    { ...options, wakeUpTimeoutMs: 10 },
  );
  const error = await producer
    .enqueue(
      "rebuild",
      Array.from({ length: 501 }, (_, index) => index),
    )
    .catch((caught: unknown) => caught);
  expect(error).toMatchObject({ name: "DocumentWakeUpTimeoutError" });
  reply.resolve(firstBatch);
  await reply.promise;
  await Promise.resolve();
  expect(calls).toBe(1);
});

test("observes a dependency rejection received after its caller timed out", async () => {
  const reply = Promise.withResolvers<unknown[]>();
  const producer = createJobWakeUpProducer<number, "rebuild">(
    { addBulk: () => reply.promise },
    { ...options, wakeUpTimeoutMs: 10 },
  );
  const error = await producer.enqueue("rebuild", [1]).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ name: "DocumentWakeUpTimeoutError" });
  reply.reject(new Error("late Redis failure"));
  await Promise.resolve();
  await Promise.resolve();
});

test.each([499, 501])("rejects acknowledgment count %s for a 500-job batch", async (acknowledged) => {
  let calls = 0;
  const producer = createJobWakeUpProducer<number, "rebuild">(
    {
      async addBulk() {
        calls += 1;
        return Array.from({ length: acknowledged });
      },
    },
    options,
  );
  const error = await producer
    .enqueue(
      "rebuild",
      Array.from({ length: 501 }, (_, index) => index),
    )
    .catch((caught: unknown) => caught);
  expect(error).toMatchObject({ message: "Document queue did not acknowledge every wake" });
  expect(calls).toBe(1);
});

test("empty wake-ups never access the queue", async () => {
  let calls = 0;
  const producer = createJobWakeUpProducer<number, "rebuild">(
    {
      async addBulk() {
        calls += 1;
        throw new Error("queue should not be called");
      },
    },
    { ...options, wakeUpTimeoutMs: 10 },
  );
  const result = await producer.enqueue("rebuild", []);
  expect(result).toEqual({ enqueued: 0, jobIds: [] });
  expect(calls).toBe(0);
});

test.each([0, -1, 1.5, Number.POSITIVE_INFINITY, 2_147_483_648])(
  "rejects invalid wake-up timeout %s",
  (wakeUpTimeoutMs) => {
    expect(() => createJobWakeUpProducer({ addBulk: async () => [] }, { ...options, wakeUpTimeoutMs })).toThrow(
      RangeError,
    );
  },
);
