import type { AdminPositionTransactionPorts } from "@admin-api/services/position/position.port";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createPositionService } from "@admin-api/services/position/position.service";
import { BadRequestError } from "@iam/api-core/errors";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { EmploymentStatus, OrganizationLevel, OrganizationType, PositionStatus, UserType } from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import { auditLogs, employments, organizations, positions, userProfileDirty, users } from "@iam/db/schema";
import { PositionCodeExistsError, PositionHasEmploymentError, PositionNotFoundError } from "@iam/domain/position";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: AdminApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

function createCommand(
  decorate: (tx: AdminPositionTransactionPorts) => AdminPositionTransactionPorts = tx => tx,
  enqueueRebuildJobs = mock(async () => ({ enqueued: 1, jobIds: ["position-job"] })),
) {
  const warn = mock(() => undefined);
  const uow = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn },
    clock: { nowDate: () => new Date("2026-09-07T00:00:00Z") },
    userProfileJobProducer: { enqueueRebuildJobs },
  });
  return {
    enqueueRebuildJobs,
    warn,
    service: createPositionService({
      positionRepository: createAdminApiRepositories(harness.db).position,
      uow: mapUnitOfWork(uow, tx => decorate({
        positionRepository: tx.repositories.position,
        auditService: tx.auditService,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    }),
  };
}

async function seedPosition(posCode = "POSITION") {
  const [position] = await harness.db.insert(positions).values({
    posCode,
    posName: posCode,
    status: PositionStatus.Enable,
  }).returning();
  return position!;
}

async function seedEmployment(positionId: number, status = EmploymentStatus.Enable) {
  const [user] = await harness.db.insert(users).values({ username: "holder", name: "Holder", userType: UserType.Formal }).returning();
  const [organization] = await harness.db.insert(organizations).values({
    orgCode: "ORG",
    orgName: "Organization",
    path: "/1",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
  }).returning();
  await harness.db.insert(employments).values({ userId: user!.id, orgId: organization!.id, posId: positionId, status, startTime: new Date("2026-08-01T00:00:00Z") });
  return user!;
}

async function facts() {
  return {
    positions: await harness.db.select().from(positions).orderBy(positions.id),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
    dirty: await harness.db.select().from(userProfileDirty),
  };
}

async function failure(operation: () => Promise<unknown>) {
  try {
    await operation();
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected command failure");
}

describe("Position mutations through production PostgreSQL UnitOfWork", () => {
  for (const secondOperation of ["status", "profile"] as const) {
    test(`a competing ${secondOperation} command observes committed locked status and preserves other fields`, async () => {
      await seedPosition();
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({
        ...tx,
        positionRepository: {
          ...tx.positionRepository,
          updatePositionByCode: async (code, patch) => {
            const result = await tx.positionRepository.updatePositionByCode(code, patch);
            written.resolve();
            await release.promise;
            return result;
          },
        },
      })).service;
      const second = createCommand().service;
      const firstPending = first.updatePositionStatus("POSITION", PositionStatus.Pause);
      await Promise.race([written.promise, firstPending]);
      const secondPending = secondOperation === "status"
        ? second.updatePositionStatus("POSITION", PositionStatus.Pause)
        : second.updatePosition("POSITION", { posName: "New name" });
      try {
        const deadline = Date.now() + 2000;
        let blocked = false;
        while (Date.now() < deadline && !blocked) {
          const rows = await harness.sql<{ blocked: boolean }[]>`
            select exists (
              select 1 from pg_stat_activity
              where wait_event_type = 'Lock' and query like '%"position"%'
                and application_name = current_setting('application_name')
                and pid <> pg_backend_pid()
            ) as blocked
          `;
          blocked = rows[0]!.blocked;
        }
        expect(blocked).toBe(true);
      }
      finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const firstResult = await firstPending;
      const secondResult = await secondPending;
      expect(firstResult).toEqual({ changed: true, result: null });
      expect(secondResult).toEqual({ changed: secondOperation === "profile", result: null });
      const after = await facts();
      expect(after.positions[0]).toMatchObject({
        status: PositionStatus.Pause,
        posName: secondOperation === "profile" ? "New name" : "POSITION",
      });
      expect(after.audits).toMatchObject([
        { details: { changed: true, status: PositionStatus.Pause } },
        { details: { changed: secondOperation === "profile", status: PositionStatus.Pause } },
      ]);
      expect(after.dirty).toEqual([]);
    });
  }

  test("creates a DTO and atomically commits an edit, audit and dirty before waking the queue", async () => {
    const { service, enqueueRebuildJobs } = createCommand();
    const created = await service.setPosition({ posCode: "POSITION", posName: "POSITION", status: PositionStatus.Enable });
    expect(created).toMatchObject({ changed: true, result: { posCode: "POSITION", posName: "POSITION" } });
    const initial = await facts();
    expect(initial.audits).toMatchObject([{ action: "admin.position.create", details: { changed: true } }]);
    const user = await seedEmployment(initial.positions[0]!.id);
    let observedAtWakeup: Awaited<ReturnType<typeof facts>> | undefined;
    enqueueRebuildJobs.mockImplementation(async () => {
      observedAtWakeup = await facts();
      return { enqueued: 1, jobIds: ["position-job"] };
    });
    const result = await service.updatePosition("POSITION", { posName: "Renamed" });
    expect(result).toEqual({ changed: true, result: null });
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(1);
    expect(observedAtWakeup?.positions[0]!.posName).toBe("Renamed");
    expect(observedAtWakeup?.audits).toHaveLength(2);
    expect(observedAtWakeup?.dirty).toMatchObject([{ userId: user.id }]);
  });

  test("profile no-op leaves facts unchanged; status no-op records intent without dirty", async () => {
    const position = await seedPosition();
    await seedEmployment(position.id);
    const { service, enqueueRebuildJobs } = createCommand();
    const before = await facts();
    const edit = await service.updatePosition("POSITION", { posName: "POSITION", description: null });
    expect(edit).toEqual({ changed: false, result: null });
    const afterEdit = await facts();
    expect(afterEdit).toEqual(before);
    const status = await service.updatePositionStatus("POSITION", PositionStatus.Enable);
    expect(status).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after.positions).toEqual(before.positions);
    expect(after.audits).toMatchObject([{ action: "admin.position.status_update", details: { changed: false } }]);
    expect(after.dirty).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    const updateStatus = await service.updatePosition("POSITION", {
      status: PositionStatus.Enable,
      posName: "POSITION",
    });
    expect(updateStatus).toEqual({ changed: false, result: null });
    const afterStatusUpdate = await facts();
    expect(afterStatusUpdate.positions).toEqual(before.positions);
    expect(afterStatusUpdate.audits).toMatchObject([
      { action: "admin.position.status_update", details: { changed: false } },
      { action: "admin.position.update", details: { changed: false } },
    ]);
    expect(afterStatusUpdate.dirty).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("missing targets, repeated deletion and empty updates do not fabricate success", async () => {
    const { service } = createCommand();
    const empty = await failure(() => service.updatePosition("MISSING", {}));
    expect(empty).toBeInstanceOf(BadRequestError);
    for (const command of [
      () => service.updatePosition("MISSING", { posName: "Name" }),
      () => service.updatePositionStatus("MISSING", PositionStatus.Pause),
      () => service.deletePosition("MISSING"),
    ]) {
      const error = await failure(command);
      expect(error).toBeInstanceOf(PositionNotFoundError);
    }
    await seedPosition();
    const deleted = await service.deletePosition("POSITION");
    expect(deleted).toEqual({ changed: true, result: null });
    const before = await facts();
    const repeated = await failure(() => service.deletePosition("POSITION"));
    expect(repeated).toBeInstanceOf(PositionNotFoundError);
    const after = await facts();
    expect(after).toEqual(before);
    expect(after.positions[0]!.isDelete).toBe(true);
    expect(after.audits).toMatchObject([{ action: "admin.position.delete", details: { changed: true } }]);
  });

  for (const status of [EmploymentStatus.Enable, EmploymentStatus.Pause]) {
    test(`Open Employment ${status} blocks pause and deletion`, async () => {
      const position = await seedPosition();
      await seedEmployment(position.id, status);
      const { service } = createCommand();
      const before = await facts();
      for (const command of [() => service.updatePositionStatus("POSITION", PositionStatus.Pause), () => service.deletePosition("POSITION")]) {
        const error = await failure(command);
        expect(error).toBeInstanceOf(PositionHasEmploymentError);
      }
      const after = await facts();
      expect(after).toEqual(before);
    });
  }

  for (const stage of ["audit", "dirty"] as const) {
    test(`rolls back the source, audit and dirty when ${stage} fails`, async () => {
      const position = await seedPosition();
      await seedEmployment(position.id);
      const sentinel = new Error(`injected ${stage} failure`);
      const { service, enqueueRebuildJobs } = createCommand(tx => ({
        ...tx,
        ...(stage === "audit"
          ? { auditService: { ...tx.auditService, recordAuditLog: async (input) => {
              await tx.auditService.recordAuditLog(input);
              throw sentinel;
            } } }
          : { userProfileInvalidation: { recordChanges: async (changes) => {
              await tx.userProfileInvalidation.recordChanges(changes);
              throw sentinel;
            } } }),
      }));
      const before = await facts();
      const error = await failure(() => service.updatePosition("POSITION", { posName: "Rolled back" }));
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  test("bestEffort queue failure preserves committed success and dirty recovery", async () => {
    const position = await seedPosition();
    await seedEmployment(position.id);
    const { service, warn } = createCommand(tx => tx, mock(async () => {
      throw new Error("queue unavailable");
    }));
    const result = await service.updatePosition("POSITION", { description: "Committed" });
    expect(result).toEqual({ changed: true, result: null });
    const after = await facts();
    expect(after.positions[0]!.description).toBe("Committed");
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });

  for (const method of ["setPosition", "updatePositionByCode", "softDeletePositionByCode"] as const) {
    test(`controlled zero-row ${method} fails closed without audit or dirty`, async () => {
      if (method !== "setPosition")
        await seedPosition();
      const { service } = createCommand(tx => ({
        ...tx,
        positionRepository: { ...tx.positionRepository, [method]: async () => null },
      }));
      const before = await facts();
      const error = await failure(() => method === "setPosition"
        ? service.setPosition({ posCode: "NEW", posName: "New", status: PositionStatus.Enable })
        : method === "updatePositionByCode" ? service.updatePosition("POSITION", { posName: "New" }) : service.deletePosition("POSITION"));
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PositionCodeExistsError);
      const after = await facts();
      expect(after).toEqual(before);
    });
  }

  test("soft-deleted codes remain occupied for create and rename", async () => {
    await seedPosition("OCCUPIED");
    await seedPosition();
    const { service } = createCommand();
    await service.deletePosition("OCCUPIED");
    const before = await facts();
    for (const command of [
      () => service.setPosition({ posCode: "OCCUPIED", posName: "New", status: PositionStatus.Enable }),
      () => service.updatePosition("POSITION", { posCode: "OCCUPIED" }),
    ]) {
      const error = await failure(command);
      expect(error).toBeInstanceOf(PositionCodeExistsError);
    }
    const after = await facts();
    expect(after).toEqual(before);
  });

  test("extracts real Drizzle cause metadata and preserves unknown unique constraints", async () => {
    await seedPosition();
    const raw = await failure(() => harness.db.insert(positions).values({ posCode: "POSITION", posName: "Other" }));
    expect(raw).toHaveProperty("cause");
    expect(extractPostgresError(raw)).toEqual({ code: "23505", constraint: "position_post_code_key" });
    await harness.sql`create unique index position_test_name_unique on position (post_name)`;
    try {
      const { service } = createCommand();
      const error = await failure(() => service.setPosition({ posCode: "OTHER", posName: "POSITION", status: PositionStatus.Enable }));
      expect(error).not.toBeInstanceOf(PositionCodeExistsError);
      expect(extractPostgresError(error)).toEqual({ code: "23505", constraint: "position_test_name_unique" });
      const after = await facts();
      expect(after.positions).toHaveLength(1);
      expect(after.audits).toEqual([]);
      expect(after.dirty).toEqual([]);
    }
    finally {
      await harness.sql`drop index position_test_name_unique`;
    }
  });

  for (const operation of ["create", "rename"] as const) {
    test(`${operation} competitors pass prechecks in independent transactions and unique constraint picks one winner`, async () => {
      if (operation === "rename") {
        await seedPosition("FIRST");
        await seedPosition("SECOND");
      }
      let arrived = 0;
      const gate = Promise.withResolvers<void>();
      const { service } = createCommand(tx => ({ ...tx, positionRepository: {
        ...tx.positionRepository,
        getAnyPositionByCode: async (code) => {
          const current = await tx.positionRepository.getAnyPositionByCode(code);
          if (code === "WINNER") {
            arrived++;
            if (arrived === 2)
              gate.resolve();
            await gate.promise;
          }
          return current;
        },
      } }));
      const results = await Promise.allSettled(operation === "create"
        ? ["First", "Second"].map(posName => service.setPosition({ posCode: "WINNER", posName, status: PositionStatus.Enable }))
        : ["FIRST", "SECOND"].map(code => service.updatePosition(code, { posCode: "WINNER" })));
      expect(arrived).toBe(2);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find(result => result.status === "rejected");
      expect(rejected?.reason).toBeInstanceOf(PositionCodeExistsError);
      const after = await facts();
      expect(after.positions.filter(position => position.posCode === "WINNER")).toHaveLength(1);
      expect(after.positions).toHaveLength(operation === "create" ? 1 : 2);
      expect(after.audits).toHaveLength(1);
      expect(after.dirty).toEqual([]);
    });
  }
});
