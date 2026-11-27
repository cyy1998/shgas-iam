import { expect, test } from "bun:test";
import { createE2EControl } from "../e2e-control.ts";
import { createE2EResetKey } from "../gateway-test.ts";

test("authenticates before dispatch and resets again when the file key or retry changes", async () => {
  const calls: string[] = [];
  let fail = true;
  const control = createE2EControl({
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

  const attempt0 = createE2EResetKey("run-1", { repeatEachIndex: 0, retry: 0, file: "one.spec.ts" });
  const attempt1 = createE2EResetKey("run-1", { repeatEachIndex: 0, retry: 1, file: "one.spec.ts" });
  const nextFile = createE2EResetKey("run-1", { repeatEachIndex: 0, retry: 0, file: "two.spec.ts" });
  expect(attempt0).toBe("run-1:0:0:one.spec.ts");
  expect(attempt1).toBe("run-1:0:1:one.spec.ts");

  const unauthorized = await reset(attempt0, "other-run-token");
  expect(unauthorized.status).toBe(401);
  expect(calls).toEqual([]);

  const failed = await reset(attempt0);
  expect(failed.status).toBe(500);
  fail = false;
  for (const key of [attempt0, attempt0, attempt1, nextFile]) {
    const result = await reset(key);
    expect(result.status).toBe(204);
  }
  expect(calls).toEqual([attempt0, attempt0, attempt1, nextFile]);
});

test("blocks Worker changes during reset and aborts the active transition on close", async () => {
  const started = Promise.withResolvers<void>();
  const calls: string[] = [];
  const control = createE2EControl({
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
  const reset = post("/reset", JSON.stringify({ file: "run-1:0:0:one.spec.ts" }));
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
