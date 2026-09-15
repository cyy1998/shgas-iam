import { EventEmitter } from "node:events";
import { expect, test } from "bun:test";
import { withOidcConformanceLifecycle } from "../composition/oidc-conformance-lifecycle.fixture";

test("conformance absorbs repeated setup and cleanup signals until every owned cleanup is attempted", async () => {
  const signals = new EventEmitter();
  const events: string[] = [];
  let failure: unknown;
  try {
    await withOidcConformanceLifecycle(async (lifecycle) => {
      expect(signals.listenerCount("SIGINT")).toBe(1);
      lifecycle.own(() => {
        events.push("first cleanup");
      });
      signals.emit("SIGINT");
      signals.emit("SIGINT");
      // A setup operation which was already in flight must register its returned resource before checking abort.
      await Promise.resolve();
      lifecycle.own(() => {
        signals.emit("SIGTERM");
        signals.emit("SIGTERM");
        expect(signals.listenerCount("SIGINT")).toBe(1);
        events.push("second cleanup");
        throw new Error("cleanup failed");
      });
      await lifecycle.checkpoint("before-driver-start");
      events.push("driver started");
    }, { signals });
  }
  catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  if (failure instanceof AggregateError)
    expect(failure.errors.map(error => error.message)).toEqual(["OIDC conformance interrupted", "cleanup failed"]);
  expect(events).toEqual(["second cleanup", "first cleanup"]);
  expect(signals.listenerCount("SIGINT")).toBe(0);
  expect(signals.listenerCount("SIGTERM")).toBe(0);
});

test("conformance reports a cleanup deadline and still attempts remaining owners", async () => {
  const signals = new EventEmitter();
  let closed = false;
  let failure: unknown;
  try {
    await withOidcConformanceLifecycle(async (lifecycle) => {
      lifecycle.own(() => {
        closed = true;
      });
      lifecycle.own(() => new Promise(() => {}));
    }, { signals, cleanupTimeoutMs: 10 });
  }
  catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect(closed).toBe(true);
  expect(signals.listenerCount("SIGINT")).toBe(0);
});
