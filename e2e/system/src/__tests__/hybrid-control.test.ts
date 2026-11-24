import { expect, test } from "bun:test";
import { createHybridControl } from "../hybrid-control.ts";

test("authenticates before dispatch and remembers only successfully reset files across clients", async () => {
  const calls: string[] = [];
  let fail = true;
  const control = createHybridControl({
    token: "current-run-token",
    async reset(file) {
      calls.push(file);
      if (fail) throw new Error("reset failed");
    },
    async stopWorker() {
      calls.push("stop");
    },
    async startWorker() {
      calls.push("start");
    },
    onFailure() {},
  });
  const reset = (file: string, token = "current-run-token") =>
    control.fetch(
      new Request("http://127.0.0.1/reset", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ file }),
      }),
    );
  const unauthorized = await reset("one.spec.ts", "other-run-token");
  expect(unauthorized.status).toBe(401);
  expect(calls).toEqual([]);

  const failed = await reset("one.spec.ts");
  expect(failed.status).toBe(500);
  fail = false;
  for (const file of ["one.spec.ts", "one.spec.ts", "two.spec.ts", "one.spec.ts"]) {
    const result = await reset(file);
    expect(result.status).toBe(204);
  }
  expect(calls).toEqual(["one.spec.ts", "one.spec.ts", "two.spec.ts", "one.spec.ts"]);
});

test("blocks Worker changes during reset and aborts the active transition on close", async () => {
  const started = Promise.withResolvers<void>();
  const calls: string[] = [];
  const control = createHybridControl({
    token: "current-run-token",
    async reset(_file, signal) {
      started.resolve();
      await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    },
    async stopWorker() {
      calls.push("stop");
    },
    async startWorker() {
      calls.push("start");
    },
    onFailure(error) {
      calls.push(error instanceof Error ? error.message : String(error));
    },
  });
  const post = (path: string, body?: string) =>
    control.fetch(
      new Request(`http://127.0.0.1${path}`, {
        method: "POST",
        headers: { authorization: "Bearer current-run-token" },
        body,
      }),
    );
  const reset = post("/reset", JSON.stringify({ file: "one.spec.ts" }));
  await started.promise;
  const conflict = await post("/worker/stop");
  expect(conflict.status).toBe(409);
  await control.close();
  const interrupted = await reset;
  expect(interrupted.status).toBe(500);
  const unavailable = await post("/worker/start");
  expect(unavailable.status).toBe(503);
  expect(calls).toEqual(["E2E control is shutting down"]);
});
