import { expect, test } from "bun:test";
import type { CreateOrganizationSearchWorkerModuleInput } from "../module";
import { createOrganizationSearchWorkerModule } from "../module";

test("organization consumer attempts queue shutdown after worker shutdown fails and preserves both errors", async () => {
  const closed: string[] = [];
  const workerError = new Error("worker close failed");
  const queueError = new Error("queue close failed");
  const input = {
    db: {},
    redis: { host: "127.0.0.1", port: 1, db: 15 },
    logger: { info() {}, error() {} },
    config: { concurrency: 2 },
    factories: {
      createQueue: () => ({
        async close() {
          closed.push("queue");
          throw queueError;
        },
      }),
      createWorker: () => ({
        on() {},
        async close() {
          closed.push("worker");
          throw workerError;
        },
      }),
    },
  } as unknown as CreateOrganizationSearchWorkerModuleInput;
  const module = createOrganizationSearchWorkerModule(input);
  await module.startConsumers();
  let error: unknown;
  try {
    await module.close();
  } catch (caught) {
    error = caught;
  }
  expect(closed).toEqual(["worker", "queue"]);
  expect(error).toBeInstanceOf(AggregateError);
  if (!(error instanceof AggregateError)) throw new Error("expected shutdown errors");
  expect(error.errors).toEqual([workerError, queueError]);
});
