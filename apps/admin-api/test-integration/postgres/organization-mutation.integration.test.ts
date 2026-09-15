import type { AdminOrganizationAuthorization } from "@admin-api/services/admin-authorization/admin-organization-authorization.type";
import type { AdminOrganizationTransactionPorts } from "@admin-api/services/organization/organization.port";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { BadRequestError } from "@iam/api-core/errors";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  UserType,
} from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import {
  auditLogs,
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  userProfileDirty,
  users,
} from "@iam/db/schema";
import {
  OrganizationCodeExistsError,
  OrganizationCreateDtoSchema,
  OrganizationHasChildrenError,
  OrganizationHasEmploymentError,
  OrganizationHasOpenResponsibilityAssignmentError,
  OrganizationNotFoundError,
} from "@iam/domain/organization";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
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
  decorate: (tx: AdminOrganizationTransactionPorts) => AdminOrganizationTransactionPorts = tx => tx,
  enqueueRebuildJobs = mock(async () => ({ enqueued: 1, jobIds: ["organization-job"] })),
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
    service: createOrganizationService({
      organizationRepository: createAdminApiRepositories(harness.db).organization,
      responsibilityReader: createAdminApiRepositories(harness.db).organizationResponsibility,
      uow: mapUnitOfWork(uow, tx =>
        decorate({
          organizationRepository: tx.repositories.organization,
          auditService: tx.auditService,
          responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
          userProfileInvalidation: tx.userProfileInvalidation,
        })),
    }),
  };
}

async function seedOrganization(orgCode = "ORGANIZATION") {
  const [organization] = await harness.db
    .insert(organizations)
    .values({
      orgCode,
      orgName: orgCode,
      status: OrganizationStatus.Enable,
      path: "",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
    })
    .returning();
  await harness.db.insert(organizationClosures).values({
    ancestorId: organization!.id,
    descendantId: organization!.id,
    depth: 0,
  });
  return organization!;
}

async function seedEmployment(organizationId: number, status = EmploymentStatus.Enable) {
  const [user] = await harness.db
    .insert(users)
    .values({ username: "holder", name: "Holder", userType: UserType.Formal })
    .returning();
  const [position] = await harness.db
    .insert(positions)
    .values({
      posCode: "POSITION",
      posName: "Position",
    })
    .returning();
  await harness.db
    .insert(employments)
    .values({
      userId: user!.id,
      orgId: organizationId,
      posId: position!.id,
      status,
      startTime: new Date("2026-08-01T00:00:00Z"),
    });
  return user!;
}

async function facts() {
  return {
    organizations: await harness.db.select().from(organizations).orderBy(organizations.id),
    closures: await harness.db
      .select()
      .from(organizationClosures)
      .orderBy(organizationClosures.ancestorId, organizationClosures.descendantId),
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

describe("Organization mutations through production PostgreSQL UnitOfWork", () => {
  for (const actor of ["scoped-outside", "full-outside", "scoped-inside"] as const) {
    test(`${actor} classifies a real code race after rollback without leaking an outside organization`, async () => {
      const parent = await seedOrganization("PARENT");
      const other = await seedOrganization("OTHER");
      const prechecked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const service = createCommand(tx => ({
        ...tx,
        organizationRepository: {
          ...tx.organizationRepository,
          getAnyOrganizationByCode: async (code) => {
            const row = await tx.organizationRepository.getAnyOrganizationByCode(code);
            if (code === "RACED") {
              prechecked.resolve();
              await release.promise;
            }
            return row;
          },
        },
      })).service;
      const denyMutation = mock((input: { concealExistence?: boolean }) => {
        if (input.concealExistence)
          throw new OrganizationNotFoundError();
        throw new Error("Unexpected authorization denial");
      });
      const authorization: AdminOrganizationAuthorization | undefined
        = actor === "full-outside"
          ? undefined
          : {
              kind: "scoped",
              rootOrganizationIds: [parent.id],
              organizationIds: actor === "scoped-inside" ? [parent.id, other.id] : [parent.id],
              getAllowedActions: () => {
                throw new Error("UI policy is outside this command");
              },
              denyMutation,
            };
      const pending = failure(() =>
        service.setOrganization(
          OrganizationCreateDtoSchema.parse({
            orgCode: "RACED",
            orgName: "Losing request",
            orgType: OrganizationType.Department,
            parentCode: "PARENT",
          }),
          undefined,
          authorization,
        ),
      );
      await Promise.race([prechecked.promise, pending]);
      try {
        // A separate production UoW wins after the first transaction observed no occupied code.
        if (actor === "scoped-inside") {
          await createCommand().service.updateOrganization("OTHER", { orgCode: "RACED" });
        }
        else {
          await createCommand().service.setOrganization(
            OrganizationCreateDtoSchema.parse({
              orgCode: "RACED",
              orgName: "Winner",
              orgType: OrganizationType.Department,
              parentCode: "OTHER",
            }),
          );
        }
      }
      finally {
        release.resolve();
      }
      const error = await pending;
      expect(error).toBeInstanceOf(
        actor === "scoped-outside" ? OrganizationNotFoundError : OrganizationCodeExistsError,
      );
      if (actor === "scoped-outside") {
        expect(denyMutation).toHaveBeenCalledWith({
          operationId: "admin.organization.create",
          resourceIdentifier: "RACED",
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
      else {
        expect(denyMutation).not.toHaveBeenCalled();
      }
      const after = await facts();
      expect(after.organizations).toHaveLength(actor === "scoped-inside" ? 2 : 3);
      expect(after.organizations.find(row => row.orgCode === "RACED")).toMatchObject({
        orgName: actor === "scoped-inside" ? "OTHER" : "Winner",
      });
      expect(after.audits).toMatchObject([
        {
          action: actor === "scoped-inside" ? "admin.organization.update" : "admin.organization.create",
        },
      ]);
      expect(after.dirty).toEqual([]);
    });
  }

  test("default and explicit Enable creation build canonical paths and complete closure relations", async () => {
    const { service } = createCommand();
    const root = await service.setOrganization(
      OrganizationCreateDtoSchema.parse({
        orgCode: "ROOT",
        orgName: "Root",
        orgType: OrganizationType.Department,
      }),
    );
    expect(root).toMatchObject({
      changed: true,
      result: { status: OrganizationStatus.Enable, level: OrganizationLevel.One, parentCode: null },
    });
    const child = await service.setOrganization(
      OrganizationCreateDtoSchema.parse({
        orgCode: "CHILD",
        orgName: "Child",
        orgType: OrganizationType.Department,
        parentCode: "ROOT",
        status: OrganizationStatus.Enable,
      }),
    );
    const after = await facts();
    const [rootRow, childRow] = after.organizations;
    expect(child).toMatchObject({
      changed: true,
      result: {
        status: OrganizationStatus.Enable,
        parentCode: "ROOT",
        level: OrganizationLevel.Two,
        path: `/${rootRow!.id}/${childRow!.id}`,
      },
    });
    expect(after.closures).toMatchObject([
      { ancestorId: rootRow!.id, descendantId: rootRow!.id, depth: 0 },
      { ancestorId: rootRow!.id, descendantId: childRow!.id, depth: 1 },
      { ancestorId: childRow!.id, descendantId: childRow!.id, depth: 0 },
    ]);
    expect(after.audits).toHaveLength(2);
  });

  for (const status of [OrganizationStatus.Pause, OrganizationStatus.Disable]) {
    test(`explicit non-Enable creation ${status} is rejected without partial facts`, async () => {
      const input = {
        orgCode: "INVALID",
        orgName: "Invalid",
        orgType: OrganizationType.Department,
        path: "",
        level: OrganizationLevel.One,
        status,
      };
      expect(OrganizationCreateDtoSchema.safeParse(input).success).toBe(false);
      const after = await facts();
      expect(after.organizations).toEqual([]);
      expect(after.closures).toEqual([]);
      expect(after.audits).toEqual([]);
    });
  }

  for (const status of [OrganizationStatus.Pause, OrganizationStatus.Disable]) {
    test(`non-enabled code ${status} stays occupied for create and rename`, async () => {
      const occupied = await seedOrganization("OCCUPIED");
      await harness.db.update(organizations).set({ status }).where(eq(organizations.id, occupied.id));
      await seedOrganization();
      const { service } = createCommand();
      const before = await facts();
      for (const command of [
        () =>
          service.setOrganization(
            OrganizationCreateDtoSchema.parse({
              orgCode: "OCCUPIED",
              orgName: "New",
              orgType: OrganizationType.Department,
            }),
          ),
        () => service.updateOrganization("ORGANIZATION", { orgCode: "OCCUPIED" }),
      ]) {
        const error = await failure(command);
        expect(error).toBeInstanceOf(OrganizationCodeExistsError);
      }
      const after = await facts();
      expect(after).toEqual(before);
    });
  }

  test("children and cross-tree Open Responsibility retain their lifecycle blockers", async () => {
    const target = await seedOrganization();
    const child = await seedOrganization("CHILD");
    await harness.db.update(organizations).set({ parentId: target.id }).where(eq(organizations.id, child.id));
    await harness.db
      .insert(organizationClosures)
      .values({ ancestorId: target.id, descendantId: child.id, depth: 1 });
    const { service } = createCommand();
    const childrenError = await failure(() => service.deleteOrganization("ORGANIZATION"));
    expect(childrenError).toBeInstanceOf(OrganizationHasChildrenError);
    const holder = await seedOrganization("HOLDER");
    await seedEmployment(holder.id);
    const [employment] = await harness.db.select().from(employments);
    const openStatuses = [
      OrganizationResponsibilityAssignmentStatus.Enable,
      OrganizationResponsibilityAssignmentStatus.Pause,
    ];
    for (const status of openStatuses) {
      await harness.db.insert(organizationResponsibilityAssignments).values({
        employmentId: employment!.id,
        targetOrganizationId: child.id,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        status,
        startTime: new Date("2026-08-01T00:00:00Z"),
      });
      const before = await facts();
      for (const command of [
        () => service.updateOrganizationStatus("ORGANIZATION", OrganizationStatus.Pause),
        () => service.deleteOrganization("ORGANIZATION"),
      ]) {
        const error = await failure(command);
        expect(error).toBeInstanceOf(OrganizationHasOpenResponsibilityAssignmentError);
      }
      const after = await facts();
      expect(after).toEqual(before);
      await harness.db.delete(organizationResponsibilityAssignments);
    }
  });

  for (const firstOperation of ["rename", "delete"] as const) {
    test(`${firstOperation} protects the target from a competing command using its old code`, async () => {
      await seedOrganization();
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({
        ...tx,
        organizationRepository: {
          ...tx.organizationRepository,
          updateOrganizationByCode: async (code, patch) => {
            const row = await tx.organizationRepository.updateOrganizationByCode(code, patch);
            written.resolve();
            await release.promise;
            return row;
          },
          softDeleteOrganizationByCode: async (code) => {
            const row = await tx.organizationRepository.softDeleteOrganizationByCode(code);
            written.resolve();
            await release.promise;
            return row;
          },
        },
      })).service;
      const firstPending
        = firstOperation === "rename"
          ? first.updateOrganization("ORGANIZATION", { orgCode: "RENAMED" })
          : first.deleteOrganization("ORGANIZATION");
      await Promise.race([written.promise, firstPending]);
      const second = createCommand().service;
      const secondPending = failure(() =>
        firstOperation === "rename"
          ? second.deleteOrganization("ORGANIZATION")
          : second.updateOrganization("ORGANIZATION", { orgName: "Unexpected" }),
      );
      try {
        const deadline = Date.now() + 2000;
        let blocked = false;
        while (Date.now() < deadline && !blocked) {
          const rows = await harness.sql<{ blocked: boolean }[]>`
            select exists (select 1 from pg_stat_activity
              where wait_event_type = 'Lock' and query like '%"organization"%'
              and application_name = current_setting('application_name')
              and pid <> pg_backend_pid()) as blocked
          `;
          blocked = rows[0]!.blocked;
        }
        expect(blocked).toBe(true);
      }
      finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const result = await firstPending;
      const error = await secondPending;
      expect(result).toEqual({ changed: true, result: null });
      expect(error).toBeInstanceOf(OrganizationNotFoundError);
      const after = await facts();
      expect(after.organizations[0]).toMatchObject({
        orgCode: firstOperation === "rename" ? "RENAMED" : "ORGANIZATION",
        orgName: "ORGANIZATION",
        isDelete: firstOperation === "delete",
      });
      expect(after.audits).toHaveLength(1);
      expect(after.dirty).toEqual([]);
    });
  }

  for (const secondOperation of ["status", "profile"] as const) {
    test(`a competing ${secondOperation} command observes committed locked status and preserves other fields`, async () => {
      await seedOrganization();
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({
        ...tx,
        organizationRepository: {
          ...tx.organizationRepository,
          updateOrganizationByCode: async (code, patch) => {
            const result = await tx.organizationRepository.updateOrganizationByCode(code, patch);
            written.resolve();
            await release.promise;
            return result;
          },
        },
      })).service;
      const second = createCommand().service;
      const firstPending = first.updateOrganizationStatus("ORGANIZATION", OrganizationStatus.Pause);
      await Promise.race([written.promise, firstPending]);
      const secondPending
        = secondOperation === "status"
          ? second.updateOrganizationStatus("ORGANIZATION", OrganizationStatus.Pause)
          : second.updateOrganization("ORGANIZATION", { orgName: "New name" });
      try {
        const deadline = Date.now() + 2000;
        let blocked = false;
        while (Date.now() < deadline && !blocked) {
          const rows = await harness.sql<{ blocked: boolean }[]>`
            select exists (
              select 1 from pg_stat_activity
              where wait_event_type = 'Lock' and query like '%"organization"%'
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
      expect(after.organizations[0]).toMatchObject({
        status: OrganizationStatus.Pause,
        orgName: secondOperation === "profile" ? "New name" : "ORGANIZATION",
      });
      expect(after.audits).toMatchObject([
        { details: { changed: true, status: OrganizationStatus.Pause } },
        { details: { changed: secondOperation === "profile", status: OrganizationStatus.Pause } },
      ]);
      expect(after.dirty).toEqual([]);
    });
  }

  test("creates a DTO and atomically commits an edit, audit and dirty before waking the queue", async () => {
    const { service, enqueueRebuildJobs } = createCommand();
    const created = await service.setOrganization({
      path: "",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
      orgCode: "ORGANIZATION",
      orgName: "ORGANIZATION",
      status: OrganizationStatus.Enable,
    });
    expect(created).toMatchObject({
      changed: true,
      result: { orgCode: "ORGANIZATION", orgName: "ORGANIZATION" },
    });
    const initial = await facts();
    expect(initial.audits).toMatchObject([
      { action: "admin.organization.create", details: { changed: true } },
    ]);
    const user = await seedEmployment(initial.organizations[0]!.id);
    let observedAtWakeup: Awaited<ReturnType<typeof facts>> | undefined;
    enqueueRebuildJobs.mockImplementation(async () => {
      observedAtWakeup = await facts();
      return { enqueued: 1, jobIds: ["organization-job"] };
    });
    const result = await service.updateOrganization("ORGANIZATION", { orgName: "Renamed" });
    expect(result).toEqual({ changed: true, result: null });
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(1);
    expect(observedAtWakeup?.organizations[0]!.orgName).toBe("Renamed");
    expect(observedAtWakeup?.audits).toHaveLength(2);
    expect(observedAtWakeup?.dirty).toMatchObject([{ userId: user.id }]);
  });

  test("profile no-op leaves facts unchanged; status no-op records intent without dirty", async () => {
    const organization = await seedOrganization();
    await seedEmployment(organization.id);
    const { service, enqueueRebuildJobs } = createCommand();
    const before = await facts();
    const edit = await service.updateOrganization("ORGANIZATION", {
      orgName: "ORGANIZATION",
      orgType: OrganizationType.Department,
    });
    expect(edit).toEqual({ changed: false, result: null });
    const afterEdit = await facts();
    expect(afterEdit).toEqual(before);
    const status = await service.updateOrganizationStatus("ORGANIZATION", OrganizationStatus.Enable);
    expect(status).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after.organizations).toEqual(before.organizations);
    expect(after.audits).toMatchObject([
      { action: "admin.organization.status_update", details: { changed: false } },
    ]);
    expect(after.dirty).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    const updateStatus = await service.updateOrganization("ORGANIZATION", {
      status: OrganizationStatus.Enable,
      orgName: "ORGANIZATION",
    });
    expect(updateStatus).toEqual({ changed: false, result: null });
    const afterStatusUpdate = await facts();
    expect(afterStatusUpdate.organizations).toEqual(before.organizations);
    expect(afterStatusUpdate.audits).toMatchObject([
      { action: "admin.organization.status_update", details: { changed: false } },
      { action: "admin.organization.update", details: { changed: false } },
    ]);
    expect(afterStatusUpdate.dirty).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("missing targets, repeated deletion and empty updates do not fabricate success", async () => {
    const { service } = createCommand();
    const empty = await failure(() => service.updateOrganization("MISSING", {}));
    expect(empty).toBeInstanceOf(BadRequestError);
    for (const command of [
      () => service.updateOrganization("MISSING", { orgName: "Name" }),
      () => service.updateOrganizationStatus("MISSING", OrganizationStatus.Pause),
      () => service.deleteOrganization("MISSING"),
    ]) {
      const error = await failure(command);
      expect(error).toBeInstanceOf(OrganizationNotFoundError);
    }
    await seedOrganization();
    const deleted = await service.deleteOrganization("ORGANIZATION");
    expect(deleted).toEqual({ changed: true, result: null });
    const before = await facts();
    const repeated = await failure(() => service.deleteOrganization("ORGANIZATION"));
    expect(repeated).toBeInstanceOf(OrganizationNotFoundError);
    const after = await facts();
    expect(after).toEqual(before);
    expect(after.organizations[0]!.isDelete).toBe(true);
    expect(after.audits).toMatchObject([{ action: "admin.organization.delete", details: { changed: true } }]);
  });

  for (const status of [EmploymentStatus.Enable, EmploymentStatus.Pause]) {
    test(`Open Employment ${status} blocks pause and deletion`, async () => {
      const organization = await seedOrganization();
      await seedEmployment(organization.id, status);
      const { service } = createCommand();
      const before = await facts();
      for (const command of [
        () => service.updateOrganizationStatus("ORGANIZATION", OrganizationStatus.Pause),
        () => service.deleteOrganization("ORGANIZATION"),
      ]) {
        const error = await failure(command);
        expect(error).toBeInstanceOf(OrganizationHasEmploymentError);
      }
      const after = await facts();
      expect(after).toEqual(before);
    });
  }

  for (const stage of ["audit", "dirty"] as const) {
    test(`rolls back the source, audit and dirty when ${stage} fails`, async () => {
      const organization = await seedOrganization();
      await seedEmployment(organization.id);
      const sentinel = new Error(`injected ${stage} failure`);
      const { service, enqueueRebuildJobs } = createCommand(tx => ({
        ...tx,
        ...(stage === "audit"
          ? {
              auditService: {
                ...tx.auditService,
                recordAuditLog: async (input) => {
                  await tx.auditService.recordAuditLog(input);
                  throw sentinel;
                },
              },
            }
          : {
              userProfileInvalidation: {
                recordChanges: async (changes) => {
                  await tx.userProfileInvalidation.recordChanges(changes);
                  throw sentinel;
                },
              },
            }),
      }));
      const before = await facts();
      const error = await failure(() =>
        service.updateOrganization("ORGANIZATION", { orgName: "Rolled back" }),
      );
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  test("bestEffort queue failure preserves committed success and dirty recovery", async () => {
    const organization = await seedOrganization();
    await seedEmployment(organization.id);
    const { service, warn } = createCommand(
      tx => tx,
      mock(async () => {
        throw new Error("queue unavailable");
      }),
    );
    const result = await service.updateOrganization("ORGANIZATION", { orgName: "Committed" });
    expect(result).toEqual({ changed: true, result: null });
    const after = await facts();
    expect(after.organizations[0]!.orgName).toBe("Committed");
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });

  for (const method of [
    "setOrganization",
    "updateOrganizationByCode",
    "softDeleteOrganizationByCode",
  ] as const) {
    test(`controlled zero-row ${method} fails closed without audit or dirty`, async () => {
      if (method !== "setOrganization")
        await seedOrganization();
      const { service } = createCommand(tx => ({
        ...tx,
        organizationRepository: { ...tx.organizationRepository, [method]: async () => null },
      }));
      const before = await facts();
      const error = await failure(() =>
        method === "setOrganization"
          ? service.setOrganization({
              path: "",
              level: OrganizationLevel.One,
              orgType: OrganizationType.Department,
              orgCode: "NEW",
              orgName: "New",
              status: OrganizationStatus.Enable,
            })
          : method === "updateOrganizationByCode"
            ? service.updateOrganization("ORGANIZATION", { orgName: "New" })
            : service.deleteOrganization("ORGANIZATION"),
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(OrganizationCodeExistsError);
      const after = await facts();
      expect(after).toEqual(before);
    });
  }

  test("soft-deleted codes remain occupied for create and rename", async () => {
    await seedOrganization("OCCUPIED");
    await seedOrganization();
    const { service } = createCommand();
    await service.deleteOrganization("OCCUPIED");
    const before = await facts();
    for (const command of [
      () =>
        service.setOrganization({
          path: "",
          level: OrganizationLevel.One,
          orgType: OrganizationType.Department,
          orgCode: "OCCUPIED",
          orgName: "New",
          status: OrganizationStatus.Enable,
        }),
      () => service.updateOrganization("ORGANIZATION", { orgCode: "OCCUPIED" }),
    ]) {
      const error = await failure(command);
      expect(error).toBeInstanceOf(OrganizationCodeExistsError);
    }
    const after = await facts();
    expect(after).toEqual(before);
  });

  test("extracts real Drizzle cause metadata and preserves unknown unique constraints", async () => {
    await seedOrganization();
    const raw = await failure(() =>
      harness.db
        .insert(organizations)
        .values({
          orgCode: "ORGANIZATION",
          orgName: "Other",
          path: "",
          level: OrganizationLevel.One,
          orgType: OrganizationType.Department,
        }),
    );
    expect(raw).toHaveProperty("cause");
    expect(extractPostgresError(raw)).toEqual({ code: "23505", constraint: "organization_org_code_key" });
    await harness.sql`create unique index organization_test_name_unique on organization (org_name)`;
    try {
      const { service } = createCommand();
      const error = await failure(() =>
        service.setOrganization({
          path: "",
          level: OrganizationLevel.One,
          orgType: OrganizationType.Department,
          orgCode: "OTHER",
          orgName: "ORGANIZATION",
          status: OrganizationStatus.Enable,
        }),
      );
      expect(error).not.toBeInstanceOf(OrganizationCodeExistsError);
      expect(extractPostgresError(error)).toEqual({
        code: "23505",
        constraint: "organization_test_name_unique",
      });
      const after = await facts();
      expect(after.organizations).toHaveLength(1);
      expect(after.audits).toEqual([]);
      expect(after.dirty).toEqual([]);
    }
    finally {
      await harness.sql`drop index organization_test_name_unique`;
    }
  });

  for (const operation of ["create", "rename"] as const) {
    test(`${operation} competitors pass prechecks in independent transactions and unique constraint picks one winner`, async () => {
      if (operation === "rename") {
        await seedOrganization("FIRST");
        await seedOrganization("SECOND");
      }
      let arrived = 0;
      const gate = Promise.withResolvers<void>();
      const { service } = createCommand(tx => ({
        ...tx,
        organizationRepository: {
          ...tx.organizationRepository,
          getAnyOrganizationByCode: async (code) => {
            const current = await tx.organizationRepository.getAnyOrganizationByCode(code);
            if (code === "WINNER") {
              arrived++;
              if (arrived === 2)
                gate.resolve();
              await gate.promise;
            }
            return current;
          },
        },
      }));
      const results = await Promise.allSettled(
        operation === "create"
          ? ["First", "Second"].map(orgName =>
              service.setOrganization({
                path: "",
                level: OrganizationLevel.One,
                orgType: OrganizationType.Department,
                orgCode: "WINNER",
                orgName,
                status: OrganizationStatus.Enable,
              }),
            )
          : ["FIRST", "SECOND"].map(code => service.updateOrganization(code, { orgCode: "WINNER" })),
      );
      expect(arrived).toBe(2);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find(result => result.status === "rejected");
      expect(rejected?.reason).toBeInstanceOf(OrganizationCodeExistsError);
      const after = await facts();
      expect(after.organizations.filter(organization => organization.orgCode === "WINNER")).toHaveLength(1);
      expect(after.organizations).toHaveLength(operation === "create" ? 1 : 2);
      expect(after.audits).toHaveLength(1);
      expect(after.dirty).toEqual([]);
    });
  }
});
