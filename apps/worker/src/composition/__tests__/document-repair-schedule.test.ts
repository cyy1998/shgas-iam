import { expect, mock, test } from "bun:test";
import { parseWorkerEnv } from "@worker/env";
import { type DocumentRepairRunResult, startDocumentRepairSchedule } from "../document-repair-schedule";

const intervalMs = 10;

function environment(organizationEnabled: boolean) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    return parseWorkerEnv({
      IAM_WORKER_DATABASE_URL: "postgresql://unused:unused@localhost/unused",
      IAM_WORKER_REDIS_HOST: "localhost",
      NODE_ENV: "test",
      IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
      IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: String(intervalMs),
      IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED: String(organizationEnabled),
      IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS: String(intervalMs),
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
  return new Promise<DocumentRepairRunResult>((resolve) => {
    if (signal.aborted) resolve({ status: "failed", failureKind: "aborted" });
    else signal.addEventListener("abort", () => resolve({ status: "failed", failureKind: "aborted" }), { once: true });
  });
}

test("enabling User Document repair does not enable Organization Document repair", async () => {
  const run = mock(async (): Promise<DocumentRepairRunResult> => ({ status: "completed" }));
  const schedule = startDocumentRepairSchedule({
    document: "organization",
    env: environment(false),
    enabledModuleKeys: ["user-document", "organization-document"],
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

test("enabled Organization Document repair requires its own module", async () => {
  const run = mock(async (): Promise<DocumentRepairRunResult> => ({ status: "completed" }));
  const schedule = startDocumentRepairSchedule({
    document: "organization",
    env: environment(true),
    enabledModuleKeys: ["user-document"],
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

test("starts enabled Organization Document repair immediately with its module", async () => {
  let calls = 0;
  const schedule = startDocumentRepairSchedule({
    document: "organization",
    env: environment(true),
    enabledModuleKeys: ["organization-document"],
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

test("a User Document cleanup failure does not stop Organization Document repair", async () => {
  const env = environment(true);
  const thirdOrganizationRound = Promise.withResolvers<void>();
  let userCalls = 0;
  let organizationCalls = 0;
  const userSchedule = startDocumentRepairSchedule({
    document: "user",
    env,
    enabledModuleKeys: ["user-document", "organization-document"],
    logger: logger(),
    async run() {
      userCalls += 1;
      return { status: "cleanup-failed", failureKind: "cleanup" };
    },
  });
  const organizationSchedule = startDocumentRepairSchedule({
    document: "organization",
    env,
    enabledModuleKeys: ["user-document", "organization-document"],
    logger: logger(),
    async run(signal) {
      organizationCalls += 1;
      if (organizationCalls === 3) {
        thirdOrganizationRound.resolve();
        return await finishWhenAborted(signal);
      }
      return { status: "completed" };
    },
  });
  try {
    await thirdOrganizationRound.promise;
    expect(userCalls).toBe(1);
    expect(organizationCalls).toBe(3);
  } finally {
    await Promise.all([userSchedule.close(), organizationSchedule.close()]);
  }
});
