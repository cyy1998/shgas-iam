import { describe, expect, test } from "bun:test";
import { runBoundedOperation, runWithCleanup } from "../bounded-operation.ts";

describe("bounded operation", () => {
  test("waits briefly for an aborting operation to settle", async () => {
    let settled = false;
    const operation = runBoundedOperation(
      async (signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              setTimeout(() => {
                settled = true;
                resolve();
              }, 5);
            },
            { once: true },
          );
        });
      },
      {
        abortSettleTimeoutMs: 50,
        timeoutMessage: "test operation deadline",
        timeoutMs: 5,
      },
    );

    await expect(operation).rejects.toThrow("test operation deadline");
    expect(settled).toBe(true);
  });

  test("rejects after the settle budget when an operation remains hung", async () => {
    let operationSignal: AbortSignal | undefined;
    const operation = runBoundedOperation(
      async (signal) => {
        operationSignal = signal;
        await new Promise(() => undefined);
      },
      {
        abortSettleTimeoutMs: 10,
        timeoutMessage: "permanently hung operation deadline",
        timeoutMs: 5,
      },
    );

    await expect(operation).rejects.toThrow("permanently hung operation deadline");
    expect(operationSignal?.aborted).toBe(true);
  });
});

test("keeps both the operation failure and the exact cleanup failure", async () => {
  const operationFailure = new Error("startup deadline");
  const cleanupFailure = new Error("compose down failed");
  const failure = await runWithCleanup(
    async () => {
      throw operationFailure;
    },
    async () => {
      throw cleanupFailure;
    },
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).toMatchObject({ errors: [operationFailure, cleanupFailure] });
});
