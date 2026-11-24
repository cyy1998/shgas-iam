import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  UserDocumentWorkStatus,
  UserStatus,
} from "@iam/contracts";
import {
  auditLogs,
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  userDocumentOutboxEntries,
  userDocumentRebuildStates,
  userDocuments,
  users,
} from "@iam/db/schema";
import { createSubjectFactsRedisInspector } from "@iam/documents/user/worker";
import { createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { asc, eq } from "drizzle-orm";
import { startEmploymentWorker, waitFor, waitForEmploymentWorkerLock } from "../support/employment-worker";
import { createWorkerPostgresTestHarness } from "../support/postgres-test-harness";
import { createWorkerRedisTestHarness, resetWorkerRedisTestDatabase } from "../support/redis-test-harness";

const beforeMidnight = "2026-11-30T15:59:58.000Z";
const midnight = "2026-11-30T16:00:00.000Z";
const status = EmploymentStatus;
const assignmentStatus = OrganizationResponsibilityAssignmentStatus;
const daytime = "2026-11-30T08:00:00.000Z";

test("shutdown finishes the locked transition and leaves remaining work for the next Worker", async () => {
  await withFixture(async (fixture) => {
    const first = await fixture.seedEmployment({ status: status.Enable, endTime: "2026-11-30" });
    const second = await fixture.seedEmployment({ status: status.Enable, endTime: "2026-11-30" });
    await fixture.seedAssignment(first.id, assignmentStatus.Enable);
    const observedAt = "2026-11-30T08:30:00.000Z";
    const worker = await fixture.pg.sql.begin(async (admin) => {
      const [blocker] = await admin<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!blocker) throw new Error("Missing held-lock connection");
      await admin`SELECT id FROM employment WHERE id=${first.id} FOR UPDATE`;
      const worker = await fixture.startWorker(daytime);
      await waitForEmploymentWorkerLock(fixture.pg, blocker.pid);
      await worker.setClock(observedAt);
      void worker.stop().catch(() => {});
      await waitFor(
        "Worker signal listener",
        async () => worker.output().includes("worker shutting down") || undefined,
      );
      return worker;
    });
    await worker.stop();
    expect(worker.output()).toContain('"event":"employment.lifecycle.stopped"');
    const stopped = await fixture.employmentStates();
    const [assignment] = await fixture.pg.db.select().from(organizationResponsibilityAssignments);
    expect(stopped).toEqual([
      [first.id, status.Disable, null, "2026-11-30", false],
      [second.id, status.Enable, null, "2026-11-30", false],
    ]);
    expect(assignment?.endTime).toEqual(new Date(observedAt));
    const recovery = await fixture.startWorker(daytime);
    await recovery.waitForEvent("employment.lifecycle.completed");
    const recovered = await fixture.employmentStates();
    expect(recovered).toEqual([
      [first.id, status.Disable, null, "2026-11-30", false],
      [second.id, status.Disable, null, "2026-11-30", false],
    ]);
  });
}, 45_000);

test("a lock wait crossing Beijing midnight is caught up with the new date", async () => {
  await withFixture(async (fixture) => {
    const due = await fixture.seedEmployment({ status: status.Enable, endTime: "2026-11-30" });
    const worker = await fixture.pg.sql.begin(async (admin) => {
      const [blocker] = await admin<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!blocker) throw new Error("Missing held-lock connection");
      await admin`SELECT id FROM employment WHERE id=${due.id} FOR UPDATE`;
      const worker = await fixture.startWorker(beforeMidnight);
      await waitForEmploymentWorkerLock(fixture.pg, blocker.pid);
      await worker.setClock(midnight);
      return worker;
    });
    await worker.waitForEvent("employment.lifecycle.superseded");
    await worker.waitForEvent("employment.lifecycle.completed");
    const final = await fixture.employmentStates();
    const audit = await fixture.audit();
    expect(final).toEqual([[due.id, status.Disable, null, "2026-12-01", false]]);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.eventTime).toEqual(new Date(midnight));
  });
}, 45_000);

test.each(["organization-document", "none"])(
  "the %s Worker leaves Employment lifecycle work to user-document",
  async (module) => {
    await withFixture(async (fixture) => {
      const due = await fixture.seedEmployment({ status: status.Enable, endTime: "2026-11-30" });
      const worker = await fixture.startWorker(daytime, {
        IAM_WORKER_ENABLED_MODULES: module,
        IAM_WORKER_BULL_BOARD_ENABLED: module === "none" ? "true" : "false",
      });
      await worker.stop();
      expect(worker.output()).not.toContain('"event":"employment.lifecycle.started"');
      const rows = await fixture.employmentStates();
      expect(rows).toEqual([[due.id, status.Enable, null, "2026-11-30", false]]);
    });
  },
  45_000,
);

test("the production Worker catches up on startup and applies the next Beijing midnight boundary", async () => {
  await withFixture(async (fixture) => {
    const catchUp = await fixture.seedEmployment({ status: status.Pending, startTime: null, endTime: null });
    const startsTonight = await fixture.seedEmployment({ status: status.Pending, startTime: "2026-12-01" });
    const endsTonight = await fixture.seedEmployment({
      status: status.Enable,
      startTime: "2026-11-30",
      endTime: "2026-12-01",
      isPrimary: true,
    });
    const missed = await fixture.seedEmployment({
      status: status.Pending,
      startTime: "2026-10-01",
      endTime: "2026-10-02",
    });
    const pausedDue = await fixture.seedEmployment({ status: status.Pause, endTime: "2026-11-30", isPrimary: true });
    const paused = await fixture.seedEmployment({ status: status.Pause, startTime: "2026-11-01" });
    const tombstone = await fixture.seedEmployment({ status: status.Enable, endTime: "2026-10-02", isDelete: true });
    const pausedAssignmentId = await fixture.seedAssignment(catchUp.id, assignmentStatus.Pause);
    const endedAssignmentId = await fixture.seedAssignment(endsTonight.id, assignmentStatus.Enable);
    const worker = await fixture.startWorker(beforeMidnight);
    await worker.waitForEvent("employment.lifecycle.completed");
    const startup = await fixture.employmentStates();
    expect(startup).toEqual([
      [catchUp.id, status.Enable, null, null, false],
      [startsTonight.id, status.Pending, "2026-12-01", null, false],
      [endsTonight.id, status.Enable, "2026-11-30", "2026-12-01", true],
      [missed.id, status.Disable, "2026-10-01", "2026-11-30", false],
      [pausedDue.id, status.Disable, null, "2026-11-30", false],
      [paused.id, status.Pause, "2026-11-01", null, false],
      [tombstone.id, status.Enable, null, "2026-10-02", false],
    ]);
    await worker.setClock(midnight);
    await worker.waitForEvent("employment.lifecycle.completed", 2);
    const afterMidnight = await fixture.employmentStates();
    expect(afterMidnight).toEqual([
      [catchUp.id, status.Enable, null, null, false],
      [startsTonight.id, status.Enable, "2026-12-01", null, false],
      [endsTonight.id, status.Disable, "2026-11-30", "2026-12-01", false],
      [missed.id, status.Disable, "2026-10-01", "2026-11-30", false],
      [pausedDue.id, status.Disable, null, "2026-11-30", false],
      [paused.id, status.Pause, "2026-11-01", null, false],
      [tombstone.id, status.Enable, null, "2026-10-02", false],
    ]);
    await fixture.waitForPublication(startsTonight, 1);
    await fixture.waitForPublication(endsTonight, 0);
    await fixture.waitForPublication(missed, 0);
    const assignments = await fixture.pg.db
      .select({
        id: organizationResponsibilityAssignments.id,
        status: organizationResponsibilityAssignments.status,
        endTime: organizationResponsibilityAssignments.endTime,
      })
      .from(organizationResponsibilityAssignments)
      .orderBy(asc(organizationResponsibilityAssignments.id));
    expect(assignments).toEqual([
      { id: pausedAssignmentId, status: assignmentStatus.Pause, endTime: null },
      { id: endedAssignmentId, status: assignmentStatus.Disable, endTime: new Date(midnight) },
    ]);
    const audit = await fixture.audit();
    expect(audit.map(({ action, targetId }) => [action, targetId])).toEqual([
      ["worker.employment.end", missed.id],
      ["worker.employment.end", pausedDue.id],
      ["worker.employment.enable", catchUp.id],
      ["admin.organization_responsibility_assignment.end", endedAssignmentId],
      ["worker.employment.end", endsTonight.id],
      ["worker.employment.enable", startsTonight.id],
    ]);
    expect(audit[0]).toMatchObject({
      actorType: "system",
      actorSystemKey: "employment-lifecycle",
      sourceApp: "iam-worker",
      details: {
        fromStatus: status.Pending,
        toStatus: status.Disable,
        previousPeriod: { startTime: "2026-10-01", endTime: "2026-10-02" },
        finalPeriod: { startTime: "2026-10-01", endTime: "2026-11-30" },
      },
    });
    await worker.stop();
    const restart = await fixture.startWorker("2026-12-03T09:00:00.000Z");
    await restart.waitForEvent("employment.lifecycle.completed");
    const repeated = await fixture.employmentStates();
    const repeatedAudit = await fixture.audit();
    const outbox = await fixture.pg.db.select().from(userDocumentOutboxEntries);
    expect(repeated).toEqual(afterMidnight);
    expect(repeatedAudit).toEqual(audit);
    expect(outbox).toHaveLength(6);
  });
}, 45_000);

test("competing Workers recheck postponed facts under lock and end a due Employment once", async () => {
  await withFixture(async (fixture) => {
    const postponed = await fixture.seedEmployment({ status: status.Enable, endTime: "2026-11-30" });
    const due = await fixture.seedEmployment({ status: status.Enable, endTime: "2026-11-30" });
    const assignmentId = await fixture.seedAssignment(due.id, assignmentStatus.Enable);
    const workers = await fixture.pg.sql.begin(async (admin) => {
      const [blocker] = await admin<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!blocker) throw new Error("Missing held-lock connection");
      await admin`UPDATE employment SET end_time='2026-12-10' WHERE id=${postponed.id}`;
      const workers = await Promise.all([fixture.startWorker(daytime), fixture.startWorker(daytime)]);
      const blocked = await waitForEmploymentWorkerLock(fixture.pg, blocker.pid, 2);
      expect(new Set(blocked).size).toBe(2);
      return workers;
    });
    await Promise.all(workers.map((worker) => worker.waitForEvent("employment.lifecycle.completed")));
    const final = await fixture.employmentStates();
    expect(final).toEqual([
      [postponed.id, status.Enable, null, "2026-12-10", false],
      [due.id, status.Disable, null, "2026-11-30", false],
    ]);
    const audit = await fixture.audit();
    expect(audit.map(({ action, targetId }) => [action, targetId])).toEqual([
      ["admin.organization_responsibility_assignment.end", assignmentId],
      ["worker.employment.end", due.id],
    ]);
    const [assignment] = await fixture.pg.db.select().from(organizationResponsibilityAssignments);
    expect(assignment).toMatchObject({ status: assignmentStatus.Disable, endTime: new Date(daytime) });
    const outbox = await fixture.pg.db.select().from(userDocumentOutboxEntries);
    expect(outbox).toHaveLength(2);
    await fixture.waitForPublication(due, 0);
  });
}, 45_000);

test("Worker rechecks a concurrent pause after selecting an Employment for automatic activation", async () => {
  await withFixture(async (fixture) => {
    const pending = await fixture.seedEmployment({ status: status.Pending });
    const worker = await fixture.pg.sql.begin(async (admin) => {
      const [blocker] = await admin<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!blocker) throw new Error("Missing held-lock connection");
      await admin`UPDATE employment SET status=${status.Pause} WHERE id=${pending.id}`;
      const worker = await fixture.startWorker(daytime);
      await waitForEmploymentWorkerLock(fixture.pg, blocker.pid);
      return worker;
    });
    await worker.waitForEvent("employment.lifecycle.completed");
    const rows = await fixture.employmentStates();
    const audit = await fixture.audit();
    const outbox = await fixture.pg.db.select().from(userDocumentOutboxEntries);
    expect(rows).toEqual([[pending.id, status.Pause, null, null, false]]);
    expect(audit).toEqual([]);
    expect(outbox).toEqual([]);
  });
}, 45_000);

test("an audit write failure rolls back the scheduled transition and startup recovers it once", async () => {
  await withFixture(async (fixture) => {
    const due = await fixture.seedEmployment({ status: status.Enable, endTime: "2026-11-30", isPrimary: true });
    await fixture.seedAssignment(due.id, assignmentStatus.Enable);
    await fixture.pg
      .sql`ALTER TABLE audit_log ADD CONSTRAINT test_reject_employment_end CHECK (action <> 'worker.employment.end')`;
    const worker = await fixture.startWorker(daytime);
    await worker.waitForEvent("employment.lifecycle.failed");
    const rows = await fixture.employmentStates();
    const [assignment] = await fixture.pg.db.select().from(organizationResponsibilityAssignments);
    const audit = await fixture.audit();
    const outbox = await fixture.pg.db.select().from(userDocumentOutboxEntries);
    expect(rows).toEqual([[due.id, status.Enable, null, "2026-11-30", true]]);
    expect(assignment).toMatchObject({ status: assignmentStatus.Enable, endTime: null });
    expect(audit).toEqual([]);
    expect(outbox).toEqual([]);
    await worker.stop();
    await fixture.pg.sql`ALTER TABLE audit_log DROP CONSTRAINT test_reject_employment_end`;
    const recovery = await fixture.startWorker("2026-12-02T08:00:00.000Z");
    await recovery.waitForEvent("employment.lifecycle.completed");
    await fixture.waitForPublication(due, 0);
    const recovered = await fixture.employmentStates();
    const recoveredAudit = await fixture.audit();
    expect(recovered).toEqual([[due.id, status.Disable, null, "2026-12-02", false]]);
    expect(recoveredAudit.map(({ action }) => action)).toEqual([
      "admin.organization_responsibility_assignment.end",
      "worker.employment.end",
    ]);
  });
}, 45_000);

test("User Document repair publishes a committed Employment transition after a publication failure", async () => {
  await withFixture(async (fixture) => {
    const ready = await fixture.seedEmployment({ status: status.Pending });
    await fixture.pg.sql`ALTER TABLE user_document ADD CONSTRAINT test_reject_publication CHECK (false)`;
    const worker = await fixture.startWorker(daytime);
    await worker.waitForEvent("employment.lifecycle.completed");
    await waitFor(
      "failed publication",
      async () => {
        const [state] = await fixture.pg.db
          .select()
          .from(userDocumentRebuildStates)
          .where(eq(userDocumentRebuildStates.userId, ready.userId));
        return state?.status === UserDocumentWorkStatus.Failed ? state : undefined;
      },
      worker.output,
    );
    const committed = await fixture.employmentStates();
    const audit = await fixture.audit();
    const outbox = await fixture.pg.db.select().from(userDocumentOutboxEntries);
    expect(committed).toEqual([[ready.id, status.Enable, null, null, false]]);
    expect(audit.map(({ action }) => action)).toEqual(["worker.employment.enable"]);
    expect(outbox).toMatchObject([
      { status: "processed", source: { change: { kind: "employment", userId: ready.userId } } },
    ]);
    await worker.stop();
    await fixture.pg.sql`ALTER TABLE user_document DROP CONSTRAINT test_reject_publication`;
    const recovery = await fixture.startWorker(daytime, {
      IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
      IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: "100",
    });
    await recovery.waitForEvent("employment.lifecycle.completed");
    await fixture.waitForPublication(ready, 1);
    const recovered = await fixture.employmentStates();
    const recoveredAudit = await fixture.audit();
    expect(recovered).toEqual(committed);
    expect(recoveredAudit).toEqual(audit);
  });
}, 45_000);

let pg: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
beforeAll(async () => {
  pg = await createWorkerPostgresTestHarness();
});
beforeEach(async () => {
  await pg.reset();
});
afterAll(async () => {
  await pg?.close();
});

async function withFixture(work: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>) {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const stopExecutors: Array<() => Promise<void> | void> = [];
    registerCleanup(async () => {
      if (stopExecutors.length > 0) await resetWorkerRedisTestDatabase(stopExecutors);
    });
    await work(await createFixture(stopExecutors));
  });
}

async function createFixture(stopExecutors: Array<() => Promise<void> | void>) {
  const redis = await createWorkerRedisTestHarness();
  stopExecutors.push(redis.close);
  const factsInspector = createSubjectFactsRedisInspector(redis.observer);
  const bootstrap = createSubjectAccessBootstrap({ redis: redis.writer, random: { uuid: randomUUID } });
  const [organization] = await pg.db
    .insert(organizations)
    .values({
      orgCode: "LIFECYCLE",
      orgName: "Lifecycle",
      path: "/1/",
      id: 1,
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    })
    .returning({ id: organizations.id });
  if (!organization) throw new Error("Missing fixture organization");
  await pg.db
    .insert(organizationClosures)
    .values({ ancestorId: organization.id, descendantId: organization.id, depth: 0 });
  const [position] = await pg.db
    .insert(positions)
    .values({ posCode: "LIFECYCLE", posName: "Lifecycle" })
    .returning({ id: positions.id });
  if (!position) throw new Error("Missing fixture position");
  const orgId = organization.id;
  const posId = position.id;

  async function seedEmployment(
    input: Pick<typeof employments.$inferInsert, "status" | "startTime" | "endTime" | "isPrimary" | "isDelete">,
  ) {
    const subjectIdentifier = randomUUID();
    const [user] = await pg.db
      .insert(users)
      .values({
        subjectIdentifier,
        username: `u-${subjectIdentifier}`,
        name: "Employment fixture",
        status: UserStatus.Enable,
      })
      .returning({ id: users.id });
    if (!user) throw new Error("Missing fixture user");
    const [employment] = await pg.db
      .insert(employments)
      .values({ ...input, userId: user.id, orgId, posId })
      .returning({ id: employments.id });
    if (!employment) throw new Error("Missing fixture employment");
    await bootstrap.seedMany([{ subjectIdentifier, state: "enabled" }], new Date(beforeMidnight));
    return { ...employment, subjectIdentifier, userId: user.id };
  }

  async function seedAssignment(employmentId: number, assignmentStatus: OrganizationResponsibilityAssignmentStatus) {
    const [assignment] = await pg.db
      .insert(organizationResponsibilityAssignments)
      .values({
        employmentId,
        targetOrganizationId: orgId,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        status: assignmentStatus,
        startTime: new Date("2026-11-01T00:00:00Z"),
      })
      .returning({ id: organizationResponsibilityAssignments.id });
    if (!assignment) throw new Error("Missing fixture responsibility");
    return assignment.id;
  }

  return {
    pg,
    redis,
    seedEmployment,
    seedAssignment,
    startWorker: (initialTime: string, overrides?: NodeJS.ProcessEnv) =>
      startEmploymentWorker({ pg, redis, stopExecutors, initialTime, overrides }),
    async employmentStates() {
      const rows = await pg.db.select().from(employments).orderBy(asc(employments.id));
      return rows.map((row) => [row.id, row.status, row.startTime, row.endTime, row.isPrimary]);
    },
    async audit() {
      return await pg.db.select().from(auditLogs).orderBy(asc(auditLogs.id));
    },
    async waitForPublication(employment: { userId: number; subjectIdentifier: string }, count: number) {
      await waitFor(`Document and Facts for user ${employment.userId}`, async () => {
        const [row] = await pg.db.select().from(userDocuments).where(eq(userDocuments.userId, employment.userId));
        const [facts] = await factsInspector.inspectMany([employment.subjectIdentifier]);
        if (
          facts?.status !== "valid" ||
          facts.record.kind !== "document" ||
          row?.sourceVersion !== facts.record.sourceVersion ||
          facts.record.facts.employments.length !== count
        )
          return;
        expect(row.document).toMatchObject({ employments: facts.record.facts.employments });
        return row;
      });
    },
  };
}
