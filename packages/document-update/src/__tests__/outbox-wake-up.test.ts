import { expect, test } from "bun:test";
import { createDocumentOutboxWakeUp, type DocumentOutboxJob } from "../index";

test("registers one post-commit wake for every nonempty registration in a transaction", async () => {
  const tasks: Array<{ name: string; callback: () => Promise<void> | void }> = [];
  const enqueued: DocumentOutboxJob[][] = [];
  const wakeUp = createDocumentOutboxWakeUp({
    afterCommit: {
      bestEffort: (name, callback) => {
        tasks.push({ name, callback });
      },
    },
    taskName: "document.outbox.wake_up",
    enqueue: async (jobs) => {
      enqueued.push(jobs);
    },
  });
  wakeUp.register([]);
  expect(tasks).toHaveLength(0);
  wakeUp.register([{ outboxId: "first" }]);
  wakeUp.register([{ outboxId: "second" }, { outboxId: "third" }]);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]?.name).toBe("document.outbox.wake_up");
  expect(enqueued).toHaveLength(0);
  await tasks[0]?.callback();
  expect(enqueued).toEqual([[{ outboxId: "first" }, { outboxId: "second" }, { outboxId: "third" }]]);
});

test("keeps transaction wake registrations independent", async () => {
  const callbacks: Array<() => Promise<void> | void> = [];
  const enqueued: DocumentOutboxJob[][] = [];
  function transactionWake() {
    return createDocumentOutboxWakeUp({
      afterCommit: {
        bestEffort: (_name, callback) => {
          callbacks.push(callback);
        },
      },
      taskName: "document.outbox.wake_up",
      enqueue: async (jobs) => {
        enqueued.push(jobs);
      },
    });
  }
  const first = transactionWake();
  const second = transactionWake();
  first.register([{ outboxId: "first" }]);
  second.register([{ outboxId: "second" }]);
  await callbacks[1]?.();
  await callbacks[0]?.();
  expect(enqueued).toEqual([[{ outboxId: "second" }], [{ outboxId: "first" }]]);
});

test("leaves delivery failure handling to the registered best-effort lifecycle", async () => {
  const tasks: Array<() => Promise<void> | void> = [];
  const failure = new Error("queue unavailable");
  const wakeUp = createDocumentOutboxWakeUp({
    afterCommit: {
      bestEffort: (_name, callback) => {
        tasks.push(callback);
      },
    },
    taskName: "document.outbox.wake_up",
    enqueue: async () => {
      throw failure;
    },
  });
  wakeUp.register([{ outboxId: "pending" }]);
  let caught: unknown;
  try {
    await tasks[0]?.();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(failure);
});
