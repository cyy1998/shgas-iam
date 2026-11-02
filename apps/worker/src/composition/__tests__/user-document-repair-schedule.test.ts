import { expect, mock, test } from "bun:test";
import { parseWorkerEnv } from "@worker/env";
import {
  startDocumentRepairSchedule,
  type DocumentRepairRunResult as UserDocumentRepairRunResult,
} from "../document-repair-schedule";

function startUserDocumentRepairSchedule(options: Omit<Parameters<typeof startDocumentRepairSchedule>[0], "document">) {
  return startDocumentRepairSchedule({ ...options, document: "user" });
}

const intervalMs = 10;

function environment(enabled = true) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    return parseWorkerEnv({
      IAM_WORKER_DATABASE_URL: "postgresql://unused:unused@localhost/unused",
      IAM_WORKER_REDIS_HOST: "localhost",
      NODE_ENV: "test",
      IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: String(enabled),
      IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: String(intervalMs),
    });
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

function logger() {
  return { info: mock(() => {}), error: mock(() => {}) };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function finishWhenAborted(signal: AbortSignal) {
  return new Promise<UserDocumentRepairRunResult>((resolve) => {
    if (signal.aborted) resolve({ status: "failed", failureKind: "aborted" });
    else signal.addEventListener("abort", () => resolve({ status: "failed", failureKind: "aborted" }), { once: true });
  });
}

test.each([
  { enabled: false, enabledModuleKeys: ["user-document"] },
  { enabled: true, enabledModuleKeys: ["organization-document"] },
])("does not run repair when disabled or the User Document module is absent: %j", async (configuration) => {
  const run = mock(async (): Promise<UserDocumentRepairRunResult> => ({ status: "completed" }));
  const schedule = startUserDocumentRepairSchedule({
    env: environment(configuration.enabled),
    enabledModuleKeys: configuration.enabledModuleKeys,
    logger: logger(),
    run,
  });
  try {
    await delay(intervalMs * 3);
    expect(run).not.toHaveBeenCalled();
  } finally {
    await schedule.close();
  }
});

test("starts the first repair immediately", async () => {
  let calls = 0;
  const schedule = startUserDocumentRepairSchedule({
    env: environment(),
    enabledModuleKeys: ["user-document"],
    logger: logger(),
    run(signal) {
      calls += 1;
      return finishWhenAborted(signal);
    },
  });
  try {
    expect(calls).toBe(1);
  } finally {
    await schedule.close();
  }
});

test("waits for the previous repair to finish before scheduling another round", async () => {
  const first = Promise.withResolvers<UserDocumentRepairRunResult>();
  const secondStarted = Promise.withResolvers<void>();
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const schedule = startUserDocumentRepairSchedule({
    env: environment(),
    enabledModuleKeys: ["user-document"],
    logger: logger(),
    async run(signal) {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        if (calls === 1) return await first.promise;
        secondStarted.resolve();
        return await finishWhenAborted(signal);
      } finally {
        active -= 1;
      }
    },
  });
  try {
    await delay(intervalMs * 3);
    expect(calls).toBe(1);
    first.resolve({ status: "completed" });
    await secondStarted.promise;
    expect(calls).toBe(2);
    expect(maxActive).toBe(1);
  } finally {
    first.resolve({ status: "completed" });
    await schedule.close();
  }
});

test.each(["failed-result", "rejected-run"])("retries a later round after an ordinary failure: %s", async (failure) => {
  const secondStarted = Promise.withResolvers<void>();
  let calls = 0;
  const schedule = startUserDocumentRepairSchedule({
    env: environment(),
    enabledModuleKeys: ["user-document"],
    logger: logger(),
    async run(signal) {
      calls += 1;
      if (calls === 1) {
        if (failure === "rejected-run") throw new Error("repair could not start");
        return { status: "failed", failureKind: "exit", exitCode: 1 };
      }
      secondStarted.resolve();
      return await finishWhenAborted(signal);
    },
  });
  try {
    await secondStarted.promise;
    expect(calls).toBe(2);
  } finally {
    await schedule.close();
  }
});

test("close aborts the active round, waits for it to finish, and prevents restart", async () => {
  const aborted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let calls = 0;
  let closed = false;
  const schedule = startUserDocumentRepairSchedule({
    env: environment(),
    enabledModuleKeys: ["user-document"],
    logger: logger(),
    async run(signal) {
      calls += 1;
      await finishWhenAborted(signal);
      aborted.resolve();
      await release.promise;
      return { status: "failed", failureKind: "aborted" };
    },
  });
  const closing = schedule.close().then(() => {
    closed = true;
  });
  try {
    await aborted.promise;
    expect(closed).toBe(false);
    release.resolve();
    await closing;
    await delay(intervalMs * 3);
    expect(closed).toBe(true);
    expect(calls).toBe(1);
  } finally {
    release.resolve();
    await closing;
  }
});

test("stops future rounds when the previous process could not be cleaned up", async () => {
  let calls = 0;
  const schedule = startUserDocumentRepairSchedule({
    env: environment(),
    enabledModuleKeys: ["user-document"],
    logger: logger(),
    async run() {
      calls += 1;
      return { status: "cleanup-failed", failureKind: "cleanup" };
    },
  });
  try {
    await delay(intervalMs * 3);
    expect(calls).toBe(1);
  } finally {
    let failure: unknown;
    try {
      await schedule.close();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
  }
});
