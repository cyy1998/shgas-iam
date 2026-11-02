import { expect, test } from "bun:test";
import {
  closeMaintenanceResources,
  MaintenanceCommandCleanupError,
  runMaintenanceCommandWithLifecycle,
} from "@iam/api-core/maintenance";

test("failed work and required shutdown failure both remain observable", async () => {
  const original = new Error("original operation failed");
  const cleanup = new Error("required close failed");
  let failure: unknown;
  try {
    await runMaintenanceCommandWithLifecycle({
      deadlineMs: 1000,
      run: async () => {
        throw original;
      },
      shutdown: async () => {
        throw cleanup;
      },
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(MaintenanceCommandCleanupError);
  expect((failure as AggregateError).errors).toEqual([original, cleanup]);
});

test("aggregate shutdown observes every close and preserves all failures", async () => {
  const first = new Error("Redis close failed");
  const second = new Error("PostgreSQL close failed");
  let failure: unknown;
  try {
    await closeMaintenanceResources([Promise.reject(first), Promise.resolve(), Promise.reject(second)]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([first, second]);
});
