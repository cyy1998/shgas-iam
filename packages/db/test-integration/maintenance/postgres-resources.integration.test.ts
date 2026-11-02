import { afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { closeMaintenancePostgresInvocation, createMaintenancePostgresResources } from "@iam/db/maintenance";
import postgres from "postgres";
import { createPostgresTestHarness } from "../support/postgres-harness";

let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;
let stopExecutors: Array<() => Promise<void> | void>;

beforeEach(async () => {
  stopExecutors = [];
  harness = await createPostgresTestHarness();
  stopExecutors.push(harness.close);
  await harness.sql`CREATE TABLE organization (id int)`;
});
afterEach(async () => {
  const failures: unknown[] = [];
  for (const close of stopExecutors.slice(1).reverse()) {
    try {
      await close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Maintenance owners did not close before fixture reset");
  await harness.close();
});

function createResources(invocationId?: string) {
  const resources = createMaintenancePostgresResources({
    databaseUrl: harness.commandDatabaseUrl,
    // Cancellation must finish while this server-side timeout is still distant.
    deadlineMs: 60_000,
    invocationId,
  });
  stopExecutors.push(() => resources.close("fixture-cleanup"));
  return resources;
}

test("the shared PostgreSQL owner closes its connection after a completed operation", async () => {
  const resources = createResources();
  const answer = await resources.db.execute("SELECT 42::int AS answer");
  expect([...answer]).toEqual([{ answer: 42 }]);
  const connected = await sessions(resources.applicationName);
  expect(connected).toHaveLength(1);

  await resources.close("command-completed");
  const closed = await sessions(resources.applicationName);
  expect([...closed]).toEqual([]);
});

test("closing a blocked owner cancels its read, closes data and control connections, and preserves a same-role database peer", async () => {
  const blocker = postgres(harness.commandDatabaseUrl, { max: 1 });
  let closed: Promise<void> | undefined;
  const reserved = { sql: blocker, close: () => (closed ??= blocker.end({ timeout: 1 })) };
  stopExecutors.push(reserved.close);
  await reserved.sql.unsafe("BEGIN");
  await reserved.sql.unsafe("LOCK TABLE organization IN ACCESS EXCLUSIVE MODE");
  const canceled = createResources();
  const peer = createResources();
  expect(canceled.applicationName).not.toBe(peer.applicationName);
  expect(Buffer.byteLength(`${canceled.applicationName}-cancel`)).toBeLessThanOrEqual(63);
  expect(Buffer.byteLength(`${peer.applicationName}-cancel`)).toBeLessThanOrEqual(63);

  const configured = await canceled.db.execute("SHOW statement_timeout");
  expect([...configured]).toEqual([{ statement_timeout: "1min" }]);
  const canceledQuery = captureFailure(canceled.db.execute("SELECT count(*) FROM organization"));
  const peerQuery = (async () => await peer.db.execute("SELECT count(*) FROM organization"))();
  // Fixture cleanup closes both owners even if an observation fails.
  void peerQuery.catch(() => {});
  const blocked = await waitForLocks([canceled.applicationName, peer.applicationName]);
  expect(blocked.map((row) => row.application_name).sort()).toEqual(
    [canceled.applicationName, peer.applicationName].sort(),
  );

  await canceled.close("deadline");
  const failure = await canceledQuery;
  expect(failure).toMatchObject({ cause: { code: "57014", message: "canceling statement due to user request" } });
  const canceledSessions = await sessions(canceled.applicationName);
  expect([...canceledSessions]).toEqual([]);
  const retained = await waitForLocks([peer.applicationName]);
  expect(retained.map((row) => row.application_name)).toEqual([peer.applicationName]);

  await reserved.close();
  const completed = await peerQuery;
  expect([...completed]).toEqual([{ count: "0" }]);
  await peer.close("command-completed");
  const peerSessions = await sessions(peer.applicationName);
  expect([...peerSessions]).toEqual([]);
}, 15_000);

test("an external process owner cancels and confirms only its disconnected invocation before returning", async () => {
  const invocationId = randomUUID();
  const resources = createResources(invocationId);
  const peer = createResources();
  const blocker = postgres(harness.commandDatabaseUrl, { max: 1 });
  stopExecutors.push(() => blocker.end({ timeout: 1 }));
  const disconnected = postgres(harness.commandDatabaseUrl, {
    max: 1,
    connection: { application_name: resources.applicationName, statement_timeout: 60_000 },
  });
  stopExecutors.push(() => disconnected.end({ timeout: 0 }));
  await blocker.begin(async (tx) => {
    await tx`LOCK TABLE organization IN ACCESS EXCLUSIVE MODE`;
    const disconnectedQuery = captureFailure(disconnected`SELECT count(*) FROM organization`);
    const peerQuery = captureFailure(peer.db.execute("SELECT count(*) FROM organization"));
    await waitForLocks([resources.applicationName, peer.applicationName]);
    await disconnected.end({ timeout: 0 });
    await disconnectedQuery;
    const before = await sessions(resources.applicationName);
    expect(before).toHaveLength(1);
    await closeMaintenancePostgresInvocation({
      databaseUrl: harness.commandDatabaseUrl,
      scope: "organization",
      invocationId,
    });
    const remaining = await sessions(resources.applicationName);
    const preserved = await waitForLocks([peer.applicationName]);
    expect([...remaining]).toEqual([]);
    expect(preserved).toHaveLength(1);
    await peer.close("fixture-cleanup");
    const peerFailure = await peerQuery;
    expect(peerFailure).toHaveProperty("cause");
  });
}, 15_000);

async function captureFailure(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("The canceled PostgreSQL operation unexpectedly completed");
}

async function sessions(applicationName: string) {
  return await harness.sql`SELECT pid,application_name FROM pg_stat_activity
    WHERE application_name=${applicationName} OR application_name=${`${applicationName}-cancel`}`;
}

async function waitForLocks(applicationNames: string[]) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await harness.sql<{ application_name: string }[]>`SELECT application_name FROM pg_stat_activity
      WHERE application_name IN ${harness.sql(applicationNames)} AND datname=current_database()
        AND usename=current_user AND state='active' AND wait_event_type='Lock'`;
    if (rows.length === applicationNames.length) return rows;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Did not observe the shared owners waiting on a real PostgreSQL lock");
}
