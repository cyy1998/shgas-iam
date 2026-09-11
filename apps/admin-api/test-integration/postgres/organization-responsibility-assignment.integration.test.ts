import type { DbClient } from "@iam/db";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { randomUUID } from "node:crypto";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createOrganizationResponsibilityService } from "@admin-api/services/organization-responsibility/organization-responsibility.service";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { createTransferEmploymentUseCase } from "@admin-api/use-cases/employment/transfer-employment/transfer-employment.use-case";
import { createCreateOrganizationResponsibilityAssignmentUseCase } from "@admin-api/use-cases/organization-responsibility/create-assignment/create-assignment.use-case";
import { createManageOrganizationResponsibilityAssignmentLifecycleUseCase } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.use-case";
import {
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
} from "@iam/api-core/subject-access";
import { createInMemorySubjectAccessStore } from "@iam/api-core/subject-access/testing";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserProfileDirtyReason,
  UserStatus,
  UserType,
} from "@iam/contracts";
import {
  auditLogs,
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  subjectAccessTransitions,
  userProfileDirty,
  users,
} from "@iam/db/schema";
import {
  OrganizationResponsibilityAssignmentCardinalityConflictError,
  OrganizationResponsibilityAssignmentDuplicateOpenError,
  OrganizationResponsibilityAssignmentNotFoundError,
  OrganizationResponsibilityAssignmentUnmanageableConflictError,
} from "@iam/domain/organization-responsibility";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { and, eq } from "drizzle-orm";
import {
  testFullOrganizationResponsibilityAuthorization,
  withTestFullOrganizationResponsibilityAuthorization,
} from "../helpers/admin-authorization";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: AdminApiPostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("Organization Responsibility Assignment PostgreSQL command", () => {
  test("commits Assignment, create audit, Profile Dirty, and then wakes the rebuild queue", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const useCase = createUseCase(fixture.now, enqueueRebuildJobs);

    const result = await useCase.execute(
      {
        employmentId: fixture.employmentId,
        targetOrganizationCode: "TARGET",
        typeCode: OrganizationResponsibilityTypeCode.Head,
      },
      {
        auditContext: {
          actorType: "admin",
          actorUserId: fixture.userId,
          sourceApp: "iam-admin",
        },
      },
    );
    expect(result).toEqual({ changed: true, result: { id: 1 } });

    expect(
      await harness!.db.select().from(organizationResponsibilityAssignments),
    ).toEqual([
      expect.objectContaining({
        id: 1,
        employmentId: fixture.employmentId,
        targetOrganizationId: fixture.targetOrganizationId,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        startTime: fixture.now,
        endTime: null,
      }),
    ]);
    expect(await harness!.db.select().from(auditLogs)).toEqual([
      expect.objectContaining({
        action: "admin.organization_responsibility_assignment.create",
        targetType: "organization_responsibility_assignment",
        targetId: 1,
      }),
    ]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([
      expect.objectContaining({
        userId: fixture.userId,
        reasonCodes: [
          UserProfileDirtyReason.OrganizationResponsibilityAssignmentUpdated,
        ],
      }),
    ]);
    expect(enqueueRebuildJobs).toHaveBeenCalledWith([
      expect.objectContaining({ userId: fixture.userId }),
    ]);

    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });
    const page = await service.listAssignments({
      orgCode: "TARGET",
      limit: 20,
    });
    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      expect.objectContaining({
        id: 1,
        holder: expect.objectContaining({
          employmentId: fixture.employmentId,
          organization: expect.objectContaining({
            fullPath: [
              expect.objectContaining({ orgCode: "HOLDER_ROOT" }),
              expect.objectContaining({ orgCode: "HOLDER" }),
            ],
          }),
        }),
        targetOrganization: expect.objectContaining({
          fullPath: [expect.objectContaining({ orgCode: "TARGET" })],
        }),
      }),
    ]);
    expect(
      await service.detailAssignment({ orgCode: "TARGET", id: 1 }),
    ).toEqual(page.items[0]!);
  });

  test("lets scoped HR create cross-root self-holder Assignments while concealing every out-of-scope endpoint combination", async () => {
    const fixture = await seedScenario();
    const outside = await seedOutsideEmployment(fixture.now);
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const rawUseCase = createRawUseCase(fixture.now, enqueueRebuildJobs);
    const authorization = await createHrOrganizationResponsibilityAuthorization(
      [
        fixture.holderRootOrganizationId,
        fixture.holderOrganizationId,
        fixture.targetOrganizationId,
      ],
      fixture.userId,
    );
    const options = {
      authorization,
      auditContext: {
        actorType: "admin" as const,
        actorUserId: fixture.userId,
        sourceApp: "iam-admin" as const,
      },
    };

    const head = await rawUseCase.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    }, options);
    const supervising = await rawUseCase.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    }, options);
    expect(head.result.id).toBeGreaterThan(0);
    expect(supervising.result.id).toBeGreaterThan(head.result.id);

    for (const input of [
      {
        employmentId: fixture.employmentId,
        targetOrganizationCode: outside.organizationCode,
      },
      {
        employmentId: outside.employmentId,
        targetOrganizationCode: "TARGET",
      },
      {
        employmentId: outside.employmentId,
        targetOrganizationCode: outside.organizationCode,
      },
    ]) {
      const failure = await captureFailure(() => rawUseCase.execute({
        ...input,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
      }, options));
      expect(failure).toBeInstanceOf(
        OrganizationResponsibilityAssignmentNotFoundError,
      );
    }

    const assignmentRows = await harness!.db
      .select()
      .from(organizationResponsibilityAssignments);
    const auditRows = await harness!.db.select().from(auditLogs);
    const dirtyRows = await harness!.db.select().from(userProfileDirty);
    expect(assignmentRows).toHaveLength(2);
    expect(assignmentRows.map(row => row.typeCode).sort()).toEqual([
      OrganizationResponsibilityTypeCode.Head,
      OrganizationResponsibilityTypeCode.Supervising,
    ]);
    expect(auditRows).toHaveLength(2);
    expect(dirtyRows).toHaveLength(1);
    expect(dirtyRows[0]).toMatchObject({ userId: fixture.userId });
  });

  test("returns opaque scoped blockers for a full-admin Assignment with an invisible holder", async () => {
    const fixture = await seedScenario();
    const outside = await seedOutsideEmployment(fixture.now);
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const fullCreate = createUseCase(fixture.now, enqueueRebuildJobs);
    const hidden = await fullCreate.execute({
      employmentId: outside.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    const beforeAssignments = await harness!.db
      .select()
      .from(organizationResponsibilityAssignments);
    const beforeAudits = await harness!.db.select().from(auditLogs);
    const beforeDirty = await harness!.db.select().from(userProfileDirty);
    const policy = createAdminAuthorizationPolicy({
      logger: { warn: mock() },
      hrAdministrationScopeResolver: {
        resolveForActor: async () => ({
          rootOrganizationIds: [
            fixture.holderRootOrganizationId,
            fixture.targetOrganizationId,
          ],
          organizationIds: [
            fixture.holderRootOrganizationId,
            fixture.holderOrganizationId,
            fixture.targetOrganizationId,
          ],
        }),
      },
    });
    const actor = {
      userId: fixture.userId,
      username: "holder",
      roles: ["iam:hr-admin"],
    };
    const responsibilityAuthorization
      = await policy.getOrganizationResponsibilityAuthorization(actor);
    const scopedCreate = createRawUseCase(fixture.now, enqueueRebuildJobs);
    const createFailure = await captureFailure(() => scopedCreate.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    }, { authorization: responsibilityAuthorization }));
    expect(createFailure).toBeInstanceOf(
      OrganizationResponsibilityAssignmentUnmanageableConflictError,
    );
    expect((createFailure as Error).message).toBe(
      "责任槽位已占用；如果当前列表没有可管理记录，请联系完整管理员",
    );
    expect(JSON.stringify(createFailure)).not.toContain(String(hidden.result.id));
    expect(JSON.stringify(createFailure)).not.toContain(
      String(outside.employmentId),
    );

    const afterAssignments = await harness!.db
      .select()
      .from(organizationResponsibilityAssignments);
    const afterAudits = await harness!.db.select().from(auditLogs);
    const afterDirty = await harness!.db.select().from(userProfileDirty);
    expect(afterAssignments).toEqual(beforeAssignments);
    expect(afterAudits).toEqual(beforeAudits);
    expect(afterDirty).toEqual(beforeDirty);

    const unitOfWork = createUnitOfWork(fixture.now, enqueueRebuildJobs);
    const repositories = createAdminApiRepositories(harness!.db);
    const organizationService = createOrganizationService({
      organizationRepository: repositories.organization,
      responsibilityReader: repositories.organizationResponsibility,
      uow: mapUnitOfWork(unitOfWork, tx => ({
        auditService: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userProfileInvalidation: tx.userProfileInvalidation,
        organizationRepository: tx.repositories.organization,
      })),
    });
    const organizationAuthorization = await policy.getOrganizationAuthorization(
      actor,
    );
    const detail = await organizationService
      .getOrganizationDetailByCodeForAdmin(
        "TARGET",
        organizationAuthorization,
      );
    const allowedActions = organizationAuthorization.getAllowedActions(
      detail.authorizationFacts,
    );
    expect(allowedActions).toMatchObject({
      changeStatus: {
        allowed: false,
        reason: "UNMANAGEABLE_RESPONSIBILITY_BLOCKED",
      },
      delete: {
        allowed: false,
        reason: "UNMANAGEABLE_RESPONSIBILITY_BLOCKED",
      },
    });
    expect(JSON.stringify(allowedActions)).not.toContain(String(hidden.result.id));
    expect(JSON.stringify(allowedActions)).not.toContain(
      String(outside.employmentId),
    );
  });

  test("rolls back Assignment, audit, and Dirty together and suppresses wake-up", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const unitOfWork = createUnitOfWork(fixture.now, enqueueRebuildJobs);
    const sentinel = new Error("force rollback after all pre-commit writes");
    const command = withTestFullOrganizationResponsibilityAuthorization(
      createCreateOrganizationResponsibilityAssignmentUseCase({
        clock: { nowDate: () => fixture.now },
        uow: mapUnitOfWork(unitOfWork, tx => ({
          assignmentStore: tx.repositories.organizationResponsibility,
          employmentReader: tx.repositories.organizationResponsibility,
          organizationReader: tx.repositories.organizationResponsibility,
          auditLogWriter: tx.auditService,
          userProfileInvalidation: { recordChanges: async (changes) => {
            await tx.userProfileInvalidation.recordChanges(changes);
            throw sentinel;
          } },
        })),
      }),
    );
    const caught = await captureFailure(() => command.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    }));
    expect(caught).toBe(sentinel);
    expect(
      await harness!.db.select().from(organizationResponsibilityAssignments),
    ).toEqual([]);
    expect(await harness!.db.select().from(auditLogs)).toEqual([]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("keeps the committed fact when the best-effort wake-up fails", async () => {
    const fixture = await seedScenario();
    const wakeFailure = new Error("queue unavailable");
    const enqueueRebuildJobs = mock(async () => {
      throw wakeFailure;
    });
    const warn = mock(() => undefined);
    const useCase = createUseCase(fixture.now, enqueueRebuildJobs, warn);

    const result = await useCase.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    });

    expect(result.result.id).toBeGreaterThan(0);
    expect(
      await harness!.db.select().from(organizationResponsibilityAssignments),
    ).toHaveLength(1);
    expect(await harness!.db.select().from(auditLogs)).toHaveLength(1);
    expect(await harness!.db.select().from(userProfileDirty)).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        afterCommit: "user_profile.rebuild.wake_up",
        err: wakeFailure,
        mode: "bestEffort",
      }),
      "best-effort afterCommit task failed",
    );
  });

  test("commits lifecycle changes and records no-op intent without new Dirty or rewritten periods", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const create = createUseCase(fixture.now, enqueueRebuildJobs);
    const created = await create.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    enqueueRebuildJobs.mockClear();
    const lifecycle = createLifecycleUseCase(fixture.now, enqueueRebuildJobs);

    for (const [command, changed] of [
      ["pause", true],
      ["pause", false],
      ["resume", true],
      ["end", true],
      ["end", false],
    ] as const) {
      const result = await lifecycle.execute({ id: created.result.id, command });
      expect(result).toEqual({ changed, result: null });
    }

    expect(
      await harness!.db
        .select({
          status: organizationResponsibilityAssignments.status,
          startTime: organizationResponsibilityAssignments.startTime,
          endTime: organizationResponsibilityAssignments.endTime,
        })
        .from(organizationResponsibilityAssignments),
    ).toEqual([
      {
        status: OrganizationResponsibilityAssignmentStatus.Disable,
        startTime: fixture.now,
        endTime: fixture.now,
      },
    ]);
    expect(
      (
        await harness!.db.select({ action: auditLogs.action }).from(auditLogs)
      ).map(row => row.action),
    ).toEqual([
      "admin.organization_responsibility_assignment.create",
      "admin.organization_responsibility_assignment.pause",
      "admin.organization_responsibility_assignment.pause",
      "admin.organization_responsibility_assignment.resume",
      "admin.organization_responsibility_assignment.end",
      "admin.organization_responsibility_assignment.end",
    ]);
    expect(await harness!.db.select().from(userProfileDirty)).toHaveLength(1);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(3);
    const dirty = await harness!.db.select().from(userProfileDirty);
    expect(dirty[0]!.dirtyVersion).toBe("4");
    const audits = await harness!.db.select().from(auditLogs);
    expect(audits).toMatchObject([true, true, false, true, true, false].map(changed => ({ details: { changed } })));
    for (const command of ["pause", "resume"] as const) {
      const error = await captureFailure(() => lifecycle.execute({ id: created.result.id, command }));
      expect(error).toMatchObject({ httpStatus: 409 });
    }
    const afterInvalidAudits = await harness!.db.select().from(auditLogs);
    expect(afterInvalidAudits).toEqual(audits);
    const later = createLifecycleUseCase(new Date(fixture.now.getTime() + 60_000), enqueueRebuildJobs);
    const retry = await later.execute({ id: created.result.id, command: "end" });
    expect(retry).toEqual({ changed: false, result: null });
    const ended = await harness!.db.select().from(organizationResponsibilityAssignments);
    expect(ended[0]!.endTime).toEqual(fixture.now);
    const afterDirty = await harness!.db.select().from(userProfileDirty);
    expect(afterDirty).toEqual(dirty);
  });

  test("authorizes scoped HR lifecycle across roots before idempotency with atomic audit and Dirty writes", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const created = await createUseCase(fixture.now, enqueueRebuildJobs).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    const lifecycle = createRawLifecycleUseCase(
      fixture.now,
      enqueueRebuildJobs,
    );
    const crossRootAuthorization
      = await createHrOrganizationResponsibilityAuthorization([
        fixture.holderOrganizationId,
        fixture.targetOrganizationId,
      ], fixture.userId);

    for (const command of ["pause", "resume", "end"] as const) {
      const changed = await lifecycle.execute(
        { id: created.result.id, command },
        { authorization: crossRootAuthorization },
      );
      expect(changed).toEqual({ changed: true, result: null });
    }

    expect(
      await harness!.db
        .select({ status: organizationResponsibilityAssignments.status })
        .from(organizationResponsibilityAssignments),
    ).toEqual([{ status: OrganizationResponsibilityAssignmentStatus.Disable }]);
    expect(
      await harness!.db.select({ action: auditLogs.action }).from(auditLogs),
    ).toEqual([
      { action: "admin.organization_responsibility_assignment.pause" },
      { action: "admin.organization_responsibility_assignment.resume" },
      { action: "admin.organization_responsibility_assignment.end" },
    ]);
    expect(await harness!.db.select().from(userProfileDirty)).toHaveLength(1);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(3);

    for (const organizationIds of [
      [fixture.holderOrganizationId],
      [fixture.targetOrganizationId],
      [],
    ]) {
      const reducedAuthorization
        = await createHrOrganizationResponsibilityAuthorization(
          organizationIds,
          fixture.userId,
        );
      const caught = await lifecycle.execute(
        { id: created.result.id, command: "end" },
        { authorization: reducedAuthorization },
      ).catch(error => error);
      expect(caught).toBeInstanceOf(
        OrganizationResponsibilityAssignmentNotFoundError,
      );
    }
    const guessedIdFailure = await lifecycle.execute(
      { id: created.result.id + 10_000, command: "pause" },
      { authorization: crossRootAuthorization },
    ).catch(error => error);
    expect(guessedIdFailure).toBeInstanceOf(
      OrganizationResponsibilityAssignmentNotFoundError,
    );
    expect(await harness!.db.select({ action: auditLogs.action }).from(auditLogs))
      .toHaveLength(3);
    expect(await harness!.db.select().from(userProfileDirty)).toHaveLength(1);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(3);
  });

  test("serializes concurrent Pause requests and records both intents with one change", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const created = await createUseCase(fixture.now, enqueueRebuildJobs).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    const lifecycle = createLifecycleUseCase(fixture.now, enqueueRebuildJobs);

    const results = await Promise.all([
      lifecycle.execute({ id: created.result.id, command: "pause" }),
      lifecycle.execute({ id: created.result.id, command: "pause" }),
    ]);
    expect(results.map(result => result.changed).sort()).toEqual([false, true]);
    expect(results.map(result => result.result)).toEqual([null, null]);

    expect(
      await harness!.db
        .select({ status: organizationResponsibilityAssignments.status })
        .from(organizationResponsibilityAssignments),
    ).toEqual([{ status: OrganizationResponsibilityAssignmentStatus.Pause }]);
    expect(
      await harness!.db.select({ action: auditLogs.action }).from(auditLogs),
    ).toEqual([
      { action: "admin.organization_responsibility_assignment.pause" },
      { action: "admin.organization_responsibility_assignment.pause" },
    ]);
    expect(await harness!.db.select().from(userProfileDirty)).toHaveLength(1);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(1);
  });

  test("atomically pauses an Employment and all selected Assignments with one aggregated Dirty version", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    await harness!.db.insert(organizationResponsibilityAssignments).values([
      {
        employmentId: fixture.employmentId,
        targetOrganizationId: fixture.targetOrganizationId,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        startTime: fixture.now,
      },
      {
        employmentId: fixture.employmentId,
        targetOrganizationId: fixture.targetOrganizationId,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        startTime: fixture.now,
      },
    ]);
    // postgres.js releases an awaited bare seed query on the next event-loop turn.
    await new Promise(resolve => setTimeout(resolve, 0));

    const lifecycle = createEmploymentAvailabilityUseCase(
      fixture.now,
      enqueueRebuildJobs,
    );
    const paused = await lifecycle.execute(
      { command: "pause", employmentId: fixture.employmentId },
      {
        auditContext: {
          actorType: "admin",
          actorUserId: fixture.userId,
          requestId: "req-parent-pause",
          traceId: "trace-parent-pause",
        },
      },
    );
    expect(paused).toEqual({ changed: true, result: null });

    expect(
      await harness!.db
        .select({ status: employments.status })
        .from(employments)
        .where(eq(employments.id, fixture.employmentId)),
    ).toEqual([{ status: EmploymentStatus.Pause }]);
    expect(
      await harness!.db
        .select({ status: organizationResponsibilityAssignments.status })
        .from(organizationResponsibilityAssignments),
    ).toEqual([
      { status: OrganizationResponsibilityAssignmentStatus.Pause },
      { status: OrganizationResponsibilityAssignmentStatus.Pause },
    ]);
    expect(
      await harness!.db
        .select({ action: auditLogs.action, details: auditLogs.details })
        .from(auditLogs),
    ).toEqual([
      expect.objectContaining({
        action: "admin.organization_responsibility_assignment.pause",
        details: expect.objectContaining({
          cause: {
            action: "pause",
            employmentId: fixture.employmentId,
            kind: "employment",
          },
        }),
      }),
      expect.objectContaining({
        action: "admin.organization_responsibility_assignment.pause",
        details: expect.objectContaining({
          cause: {
            action: "pause",
            employmentId: fixture.employmentId,
            kind: "employment",
          },
        }),
      }),
      expect.objectContaining({ action: "admin.employment.pause" }),
    ]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([
      expect.objectContaining({
        dirtyVersion: "1",
        reasonCodes: [
          UserProfileDirtyReason.EmploymentUpdated,
          UserProfileDirtyReason.OrganizationResponsibilityAssignmentUpdated,
        ],
        userId: fixture.userId,
      }),
    ]);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(1);
  });

  test("rolls back the Employment cascade and its Assignment audit when the parent audit fails", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const created = await createUseCase(fixture.now, enqueueRebuildJobs).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    await new Promise(resolve => setTimeout(resolve, 0));
    const expected = new Error("parent audit unavailable");
    const parentPause = createChangeEmploymentAvailabilityUseCase({
      uow: mapUnitOfWork(
        createUnitOfWork(fixture.now, enqueueRebuildJobs),
        tx => ({
          employmentStore: tx.repositories.employment,
          organizationReader: tx.repositories.organization,
          responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
          userProfileInvalidation: tx.userProfileInvalidation,
          auditLogWriter: {
            recordAuditLog: async (input) => {
              if (input.action === "admin.employment.pause")
                throw expected;
              await tx.auditService.recordAuditLog(input);
            },
          },
        }),
      ),
    });

    let caught: unknown;
    try {
      await parentPause.execute({
        command: "pause",
        employmentId: fixture.employmentId,
      });
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBe(expected);
    expect(
      await harness!.db
        .select({ status: employments.status })
        .from(employments)
        .where(eq(employments.id, fixture.employmentId)),
    ).toEqual([{ status: EmploymentStatus.Enable }]);
    expect(
      await harness!.db
        .select({ status: organizationResponsibilityAssignments.status })
        .from(organizationResponsibilityAssignments)
        .where(eq(organizationResponsibilityAssignments.id, created.result.id)),
    ).toEqual([{ status: OrganizationResponsibilityAssignmentStatus.Enable }]);
    expect(await harness!.db.select().from(auditLogs)).toEqual([]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("does not resurrect or re-audit an Assignment End that wins a row-lock race with parent Pause", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const created = await createUseCase(fixture.now, enqueueRebuildJobs).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    await new Promise(resolve => setTimeout(resolve, 0));

    const directEndReachedAudit = deferred<void>();
    const releaseDirectEnd = deferred<void>();
    const directEnd = withTestFullOrganizationResponsibilityAuthorization(
      createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
        clock: { nowDate: () => fixture.now },
        uow: mapUnitOfWork(
          createUnitOfWork(fixture.now, enqueueRebuildJobs),
          tx => ({
            assignmentStore: tx.repositories.organizationResponsibility,
            userProfileInvalidation: tx.userProfileInvalidation,
            auditLogWriter: {
              recordAuditLog: async (input) => {
                directEndReachedAudit.resolve();
                await releaseDirectEnd.promise;
                await tx.auditService.recordAuditLog(input);
              },
            },
          }),
        ),
      }),
    );
    const parentPause = createEmploymentAvailabilityUseCase(
      fixture.now,
      enqueueRebuildJobs,
    );

    const direct = directEnd.execute({ command: "end", id: created.result.id });
    let parent: ReturnType<typeof parentPause.execute> | undefined;
    try {
      await waitForGateOrOperationFailure(
        directEndReachedAudit.promise,
        direct,
        "direct End did not acquire the Assignment row lock",
      );
      parent = parentPause.execute({
        command: "pause",
        employmentId: fixture.employmentId,
      });
      await waitForBlockedPostgresQuery("organization_responsibility_assignment");
      releaseDirectEnd.resolve();
      const directResult = await direct;
      expect(directResult).toEqual({ changed: true, result: null });
      const parentResult = await parent;
      expect(parentResult).toEqual({ changed: true, result: null });
    }
    finally {
      releaseDirectEnd.resolve();
      await direct.catch(() => undefined);
      await parent?.catch(() => undefined);
    }

    expect(
      await harness!.db
        .select({
          endTime: organizationResponsibilityAssignments.endTime,
          status: organizationResponsibilityAssignments.status,
        })
        .from(organizationResponsibilityAssignments)
        .where(eq(organizationResponsibilityAssignments.id, created.result.id)),
    ).toEqual([{
      endTime: fixture.now,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
    }]);
    expect(
      await harness!.db
        .select({ action: auditLogs.action })
        .from(auditLogs),
    ).toEqual([
      { action: "admin.organization_responsibility_assignment.end" },
      { action: "admin.employment.pause" },
    ]);
  });

  test("ends an Employment and every Open Assignment at one transaction time", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const created = await createUseCase(fixture.now, enqueueRebuildJobs).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    await new Promise(resolve => setTimeout(resolve, 0));

    await createEndEmploymentUseCase({
      clock: { nowDate: () => fixture.now },
      uow: mapUnitOfWork(
        createUnitOfWork(fixture.now, enqueueRebuildJobs),
        tx => ({
          auditLogWriter: tx.auditService,
          employmentStore: tx.repositories.employment,
          responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
          userProfileInvalidation: tx.userProfileInvalidation,
        }),
      ),
    }).execute({ employmentId: fixture.employmentId });

    expect(
      await harness!.db
        .select({ endTime: employments.endTime, status: employments.status })
        .from(employments)
        .where(eq(employments.id, fixture.employmentId)),
    ).toEqual([{ endTime: fixture.now, status: EmploymentStatus.Disable }]);
    expect(
      await harness!.db
        .select({
          endTime: organizationResponsibilityAssignments.endTime,
          status: organizationResponsibilityAssignments.status,
        })
        .from(organizationResponsibilityAssignments)
        .where(eq(organizationResponsibilityAssignments.id, created.result.id)),
    ).toEqual([{
      endTime: fixture.now,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
    }]);
    expect(
      await harness!.db
        .select({ action: auditLogs.action, details: auditLogs.details })
        .from(auditLogs),
    ).toEqual([
      expect.objectContaining({
        action: "admin.organization_responsibility_assignment.end",
        details: expect.objectContaining({
          cause: {
            action: "end",
            employmentId: fixture.employmentId,
            kind: "employment",
          },
        }),
      }),
      expect.objectContaining({ action: "admin.employment.end" }),
    ]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([
      expect.objectContaining({
        dirtyVersion: "1",
        reasonCodes: [
          UserProfileDirtyReason.EmploymentUpdated,
          UserProfileDirtyReason.OrganizationResponsibilityAssignmentUpdated,
        ],
        userId: fixture.userId,
      }),
    ]);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(1);
  });

  test("ends old responsibilities on Transfer without inheriting them into the new Employment", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const created = await createUseCase(fixture.now, enqueueRebuildJobs).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    await new Promise(resolve => setTimeout(resolve, 0));

    const result = await createTransferEmploymentUseCase({
      clock: { nowDate: () => fixture.now },
      uow: mapUnitOfWork(
        createUnitOfWork(fixture.now, enqueueRebuildJobs),
        tx => ({
          auditLogWriter: tx.auditService,
          employmentStore: tx.repositories.employment,
          organizationReader: tx.repositories.organization,
          positionReader: tx.repositories.position,
          responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
          userProfileInvalidation: tx.userProfileInvalidation,
          userReader: tx.repositories.user,
        }),
      ),
    }).execute({
      employmentId: fixture.employmentId,
      newOrgCode: "TARGET",
      newPosCode: "SECOND",
      isPrimary: false,
    });

    expect(
      await harness!.db
        .select({ status: organizationResponsibilityAssignments.status })
        .from(organizationResponsibilityAssignments)
        .where(eq(organizationResponsibilityAssignments.id, created.result.id)),
    ).toEqual([{ status: OrganizationResponsibilityAssignmentStatus.Disable }]);
    expect(
      await harness!.db
        .select({ id: organizationResponsibilityAssignments.id })
        .from(organizationResponsibilityAssignments)
        .where(eq(
          organizationResponsibilityAssignments.employmentId,
          result.result.id,
        )),
    ).toEqual([]);
    expect(
      await harness!.db
        .select({ details: auditLogs.details })
        .from(auditLogs)
        .where(eq(
          auditLogs.action,
          "admin.organization_responsibility_assignment.end",
        )),
    ).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          cause: {
            action: "transfer",
            employmentId: fixture.employmentId,
            kind: "employment",
          },
        }),
      }),
    ]);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(1);
  });

  test("rejects scoped HR resignation when production readers find any out-of-scope Open Employment", async () => {
    const fixture = await seedScenario();
    const [outsidePosition] = await harness!.db
      .insert(positions)
      .values({
        posCode: "OUTSIDE",
        posName: "Outside Position",
        status: PositionStatus.Enable,
      })
      .returning({ id: positions.id });
    const [outsideEmployment] = await harness!.db
      .insert(employments)
      .values({
        userId: fixture.userId,
        orgId: fixture.targetOrganizationId,
        posId: outsidePosition!.id,
        status: EmploymentStatus.Enable,
        startTime: fixture.now,
      })
      .returning({ id: employments.id });
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const userRepository = createAdminApiRepositories(harness!.db).user;
    const subject = await userRepository.getUserByUsernameForAdmin("holder");
    if (subject === null)
      throw new Error("mixed-scope resignation fixture user is missing");
    const revokeUserSessions = mock(async () => undefined);
    const resign = createResignUserUseCase({
      clock: { nowDate: () => fixture.now },
      sessionRevocation: { prepareUserSessionRevocation: async () => ({ revoke: revokeUserSessions }) },
      subjectAccessLifecycle: createPostgresSubjectAccessLifecycle(
        subject.subjectIdentifier,
        fixture.now,
      ),
      userReader: userRepository,
      uow: mapUnitOfWork(
        createUnitOfWork(fixture.now, enqueueRebuildJobs),
        tx => ({
          auditLogWriter: tx.auditService,
          employmentStore: tx.repositories.employment,
          responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
          subjectAccessMutation: tx.subjectAccessMutation,
          userProfileInvalidation: tx.userProfileInvalidation,
          userStore: tx.repositories.user,
        }),
      ),
    });

    let caught: unknown;
    try {
      await resign.execute(
        { username: "holder" },
        { authorization: await createHolderRootUserAuthorization(fixture) },
      );
    }
    catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ httpStatus: 403 });
    expect(
      await harness!.db
        .select({
          endTime: employments.endTime,
          id: employments.id,
          status: employments.status,
        })
        .from(employments)
        .where(eq(employments.userId, fixture.userId))
        .orderBy(employments.id),
    ).toEqual([
      {
        endTime: null,
        id: fixture.employmentId,
        status: EmploymentStatus.Enable,
      },
      {
        endTime: null,
        id: outsideEmployment!.id,
        status: EmploymentStatus.Enable,
      },
    ]);
    expect(
      await harness!.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, fixture.userId)),
    ).toEqual([{ status: UserStatus.Enable }]);
    expect(await harness!.db.select().from(auditLogs)).toEqual([]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([]);
    expect(await harness!.db.select().from(subjectAccessTransitions)).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  test("rejects every zero-Open non-retry User through production readers without writes", async () => {
    const fixture = await seedScenario();
    await harness!.db
      .update(employments)
      .set({
        endTime: fixture.now,
        status: EmploymentStatus.Disable,
      })
      .where(eq(employments.id, fixture.employmentId));
    await harness!.db
      .update(employments)
      .set({
        endTime: fixture.now,
        orgId: fixture.targetOrganizationId,
        status: EmploymentStatus.Disable,
      })
      .where(eq(employments.id, fixture.secondEmploymentId));
    await harness!.db
      .update(users)
      .set({ status: UserStatus.Disable })
      .where(eq(users.id, fixture.secondUserId));

    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const revokeUserSessions = mock(async () => undefined);
    const userRepository = createAdminApiRepositories(harness!.db).user;
    const holder = await userRepository.getUserByUsernameForAdmin("holder");
    const secondHolder = await userRepository.getUserByUsernameForAdmin("second-holder");
    if (holder === null || secondHolder === null)
      throw new Error("zero-Open resignation fixture user is missing");
    const createResign = (subjectIdentifier: string) => createResignUserUseCase({
      clock: { nowDate: () => fixture.now },
      sessionRevocation: { prepareUserSessionRevocation: async () => ({ revoke: revokeUserSessions }) },
      subjectAccessLifecycle: createPostgresSubjectAccessLifecycle(
        subjectIdentifier,
        fixture.now,
      ),
      userReader: userRepository,
      uow: mapUnitOfWork(
        createUnitOfWork(fixture.now, enqueueRebuildJobs),
        tx => ({
          auditLogWriter: tx.auditService,
          employmentStore: tx.repositories.employment,
          responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
          subjectAccessMutation: tx.subjectAccessMutation,
          userProfileInvalidation: tx.userProfileInvalidation,
          userStore: tx.repositories.user,
        }),
      ),
    });
    const authorization = await createHolderRootUserAuthorization(fixture);

    const enableFailure = await captureFailure(() => createResign(
      holder.subjectIdentifier,
    ).execute({ username: "holder" }, { authorization }));
    await harness!.db
      .update(users)
      .set({ status: UserStatus.Pause })
      .where(eq(users.id, fixture.userId));
    const pauseFailure = await captureFailure(() => createResign(
      holder.subjectIdentifier,
    ).execute({ username: "holder" }, { authorization }));
    const disableWithoutInScopeHistoryFailure = await captureFailure(() =>
      createResign(secondHolder.subjectIdentifier).execute(
        { username: "second-holder" },
        { authorization },
      ));

    expect(enableFailure).toMatchObject({ httpStatus: 403 });
    expect(pauseFailure).toMatchObject({ httpStatus: 403 });
    expect(disableWithoutInScopeHistoryFailure).toMatchObject({ httpStatus: 403 });
    expect(
      await harness!.db
        .select({ id: users.id, status: users.status })
        .from(users)
        .orderBy(users.id),
    ).toEqual([
      { id: fixture.userId, status: UserStatus.Pause },
      { id: fixture.secondUserId, status: UserStatus.Disable },
    ]);
    expect(await harness!.db.select().from(auditLogs)).toEqual([]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([]);
    expect(await harness!.db.select().from(subjectAccessTransitions)).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  test("atomically commits scoped HR resignation through production Subject Access and accepts only its completed retry", async () => {
    const fixture = await seedScenario();
    const [secondResignationPosition] = await harness!.db
      .insert(positions)
      .values({
        posCode: "RESIGN_SECOND",
        posName: "Second Resignation Position",
        status: PositionStatus.Enable,
      })
      .returning({ id: positions.id });
    const [secondResignationEmployment] = await harness!.db
      .insert(employments)
      .values({
        userId: fixture.userId,
        orgId: fixture.holderRootOrganizationId,
        posId: secondResignationPosition!.id,
        status: EmploymentStatus.Enable,
        startTime: fixture.now,
      })
      .returning({ id: employments.id });
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const create = createUseCase(fixture.now, enqueueRebuildJobs);
    await create.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await create.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "HOLDER_ROOT",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    });
    await create.execute({
      employmentId: secondResignationEmployment!.id,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    await new Promise(resolve => setTimeout(resolve, 0));

    const userRepository = createAdminApiRepositories(harness!.db).user;
    const subject = await userRepository.getUserByUsernameForAdmin("holder");
    if (subject === null)
      throw new Error("resignation fixture user is missing");
    const authorization = await createHolderRootUserAuthorization(fixture);
    const committedSnapshots: Array<{
      employmentStatuses: EmploymentStatus[];
      userStatus: UserStatus;
    }> = [];
    const revokeUserSessions = mock(async () => {
      const employmentRows = await harness!.db
        .select({ status: employments.status })
        .from(employments)
        .where(eq(employments.userId, fixture.userId))
        .orderBy(employments.id);
      const [userRow] = await harness!.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, fixture.userId));
      committedSnapshots.push({
        employmentStatuses: employmentRows.map(row => row.status),
        userStatus: userRow!.status,
      });
      throw new Error("session revocation unavailable");
    });
    const resign = createResignUserUseCase({
      clock: { nowDate: () => fixture.now },
      sessionRevocation: { prepareUserSessionRevocation: async () => ({ revoke: revokeUserSessions }) },
      subjectAccessLifecycle: createPostgresSubjectAccessLifecycle(
        subject.subjectIdentifier,
        fixture.now,
      ),
      userReader: userRepository,
      uow: mapUnitOfWork(
        createUnitOfWork(fixture.now, enqueueRebuildJobs),
        tx => ({
          auditLogWriter: tx.auditService,
          employmentStore: tx.repositories.employment,
          responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
          subjectAccessMutation: tx.subjectAccessMutation,
          userProfileInvalidation: tx.userProfileInvalidation,
          userStore: tx.repositories.user,
        }),
      ),
    });

    const firstResult = await resign.execute(
      { username: "holder" },
      { authorization },
    );
    expect(firstResult).toEqual({ changed: true, result: null });

    expect(
      await harness!.db
        .select({ status: organizationResponsibilityAssignments.status })
        .from(organizationResponsibilityAssignments),
    ).toEqual([
      { status: OrganizationResponsibilityAssignmentStatus.Disable },
      { status: OrganizationResponsibilityAssignmentStatus.Disable },
      { status: OrganizationResponsibilityAssignmentStatus.Disable },
    ]);
    expect(
      await harness!.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, fixture.userId)),
    ).toEqual([{ status: UserStatus.Disable }]);
    expect(
      await harness!.db
        .select({
          endTime: employments.endTime,
          isPrimary: employments.isPrimary,
          status: employments.status,
        })
        .from(employments)
        .where(eq(employments.userId, fixture.userId))
        .orderBy(employments.id),
    ).toEqual([
      {
        endTime: fixture.now,
        isPrimary: false,
        status: EmploymentStatus.Disable,
      },
      {
        endTime: fixture.now,
        isPrimary: false,
        status: EmploymentStatus.Disable,
      },
    ]);
    expect(
      await harness!.db
        .select({ details: auditLogs.details })
        .from(auditLogs)
        .where(eq(
          auditLogs.action,
          "admin.organization_responsibility_assignment.end",
        )),
    ).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          cause: { action: "resignation", kind: "user", userId: fixture.userId },
        }),
      }),
      expect.objectContaining({
        details: expect.objectContaining({
          cause: { action: "resignation", kind: "user", userId: fixture.userId },
        }),
      }),
      expect.objectContaining({
        details: expect.objectContaining({
          cause: { action: "resignation", kind: "user", userId: fixture.userId },
        }),
      }),
    ]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([
      expect.objectContaining({
        dirtyVersion: "1",
        reasonCodes: [
          UserProfileDirtyReason.UserUpdated,
          UserProfileDirtyReason.EmploymentUpdated,
          UserProfileDirtyReason.OrganizationResponsibilityAssignmentUpdated,
        ],
        userId: fixture.userId,
      }),
    ]);
    expect(
      await harness!.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.action, "admin.employment.resign_user")),
    ).toEqual([{ action: "admin.employment.resign_user" }]);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(1);
    expect(committedSnapshots).toEqual([{
      employmentStatuses: [EmploymentStatus.Disable, EmploymentStatus.Disable],
      userStatus: UserStatus.Disable,
    }]);
    expect(
      await harness!.db
        .select({
          status: subjectAccessTransitions.status,
          targetState: subjectAccessTransitions.targetState,
        })
        .from(subjectAccessTransitions),
    ).toEqual([{ status: "committed", targetState: "disabled" }]);

    const auditRowsBeforeRetry = await harness!.db.select().from(auditLogs);
    const dirtyRowsBeforeRetry = await harness!.db.select().from(userProfileDirty);
    const retryResult = await resign.execute(
      { username: "holder" },
      { authorization },
    );

    expect(retryResult).toEqual({ changed: false, result: null });
    const auditRowsAfterRetry = await harness!.db.select().from(auditLogs);
    expect(auditRowsAfterRetry).toHaveLength(auditRowsBeforeRetry.length + 1);
    expect(auditRowsAfterRetry.at(-1)).toMatchObject({ action: "admin.employment.resign_user", details: { changed: false } });
    expect(await harness!.db.select().from(userProfileDirty)).toEqual(dirtyRowsBeforeRetry);
    expect(enqueueRebuildJobs).toHaveBeenCalledTimes(1);
    expect(revokeUserSessions).toHaveBeenCalledTimes(2);
    expect(committedSnapshots).toEqual([
      {
        employmentStatuses: [EmploymentStatus.Disable, EmploymentStatus.Disable],
        userStatus: UserStatus.Disable,
      },
      {
        employmentStatuses: [EmploymentStatus.Disable, EmploymentStatus.Disable],
        userStatus: UserStatus.Disable,
      },
    ]);
    expect(
      await harness!.db
        .select({
          status: subjectAccessTransitions.status,
          targetState: subjectAccessTransitions.targetState,
        })
        .from(subjectAccessTransitions),
    ).toEqual([
      { status: "committed", targetState: "disabled" },
      { status: "committed", targetState: "disabled" },
    ]);
  });

  test("rolls back every resignation database fact when the final business audit fails", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const created = await createUseCase(fixture.now, enqueueRebuildJobs).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    await new Promise(resolve => setTimeout(resolve, 0));

    const userRepository = createAdminApiRepositories(harness!.db).user;
    const subject = await userRepository.getUserByUsernameForAdmin("holder");
    if (subject === null)
      throw new Error("resignation rollback fixture user is missing");
    const authorization = await createHolderRootUserAuthorization(fixture);
    const expected = new Error("resignation audit unavailable");
    const revokeUserSessions = mock(async () => undefined);
    const resign = createResignUserUseCase({
      clock: { nowDate: () => fixture.now },
      sessionRevocation: { prepareUserSessionRevocation: async () => ({ revoke: revokeUserSessions }) },
      subjectAccessLifecycle: createPostgresSubjectAccessLifecycle(
        subject.subjectIdentifier,
        fixture.now,
      ),
      userReader: userRepository,
      uow: mapUnitOfWork(
        createUnitOfWork(fixture.now, enqueueRebuildJobs),
        tx => ({
          employmentStore: tx.repositories.employment,
          responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
          subjectAccessMutation: tx.subjectAccessMutation,
          userProfileInvalidation: tx.userProfileInvalidation,
          userStore: tx.repositories.user,
          auditLogWriter: {
            recordAuditLog: async (input) => {
              if (input.action === "admin.employment.resign_user")
                throw expected;
              await tx.auditService.recordAuditLog(input);
            },
          },
        }),
      ),
    });

    let caught: unknown;
    try {
      await resign.execute({ username: "holder" }, { authorization });
    }
    catch (error) {
      caught = error;
    }

    expect(caught).toBe(expected);
    expect(
      await harness!.db
        .select({
          endTime: employments.endTime,
          status: employments.status,
        })
        .from(employments)
        .where(eq(employments.id, fixture.employmentId)),
    ).toEqual([{ endTime: null, status: EmploymentStatus.Enable }]);
    expect(
      await harness!.db
        .select({
          endTime: organizationResponsibilityAssignments.endTime,
          status: organizationResponsibilityAssignments.status,
        })
        .from(organizationResponsibilityAssignments)
        .where(eq(organizationResponsibilityAssignments.id, created.result.id)),
    ).toEqual([{
      endTime: null,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
    }]);
    expect(
      await harness!.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, fixture.userId)),
    ).toEqual([{ status: UserStatus.Enable }]);
    expect(await harness!.db.select().from(auditLogs)).toEqual([]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([]);
    expect(
      await harness!.db
        .select({
          status: subjectAccessTransitions.status,
          targetState: subjectAccessTransitions.targetState,
        })
        .from(subjectAccessTransitions),
    ).toEqual([{ status: "rolled_back", targetState: "rollback" }]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  test("guards an Organization by all descendant Open targets while ignoring enabled descendants and Ended history", async () => {
    const fixture = await seedScenario();
    const repository = createAdminApiRepositories(harness!.db)
      .organizationResponsibility;

    expect(
      await repository.hasOpenAssignmentTargetingOrganizationSubtree(
        fixture.holderRootOrganizationId,
      ),
    ).toBe(false);
    const [created] = await harness!.db
      .insert(organizationResponsibilityAssignments)
      .values({
        employmentId: fixture.employmentId,
        targetOrganizationId: fixture.holderOrganizationId,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        startTime: fixture.now,
      })
      .returning({ id: organizationResponsibilityAssignments.id });
    expect(
      await repository.hasOpenAssignmentTargetingOrganizationSubtree(
        fixture.holderRootOrganizationId,
      ),
    ).toBe(true);
    await harness!.db
      .update(organizationResponsibilityAssignments)
      .set({
        endTime: fixture.now,
        status: OrganizationResponsibilityAssignmentStatus.Disable,
      })
      .where(eq(organizationResponsibilityAssignments.id, created!.id));
    expect(
      await repository.hasOpenAssignmentTargetingOrganizationSubtree(
        fixture.holderRootOrganizationId,
      ),
    ).toBe(false);
  });

  test("serializes direct Resume then Pause and leaves ordinary parents unlocked", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const created = await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    const lifecycle = createLifecycleUseCase(fixture.now, producer);
    await lifecycle.execute({ id: created.result.id, command: "pause" });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    producer.mockClear();
    const entered = deferred<void>();
    const release = deferred<void>();
    const gated = withTestFullOrganizationResponsibilityAuthorization(
      createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
        clock: { nowDate: () => fixture.now },
        uow: mapUnitOfWork(createUnitOfWork(fixture.now, producer), tx => ({
          assignmentStore: tx.repositories.organizationResponsibility,
          userProfileInvalidation: tx.userProfileInvalidation,
          auditLogWriter: { recordAuditLog: async (input) => {
            await tx.auditService.recordAuditLog(input);
            entered.resolve();
            await release.promise;
          } },
        })),
      }),
    );
    const resume = gated.execute({ id: created.result.id, command: "resume" });
    let pause: ReturnType<typeof lifecycle.execute> | undefined;
    try {
      await waitForGateOrOperationFailure(entered.promise, resume, "Resume did not reach its audit gate");
      pause = lifecycle.execute({ id: created.result.id, command: "pause" });
      await waitForBlockedPostgresQuery("organization_responsibility_assignment");
      await harness!.sql.begin(async (tx) => {
        await tx`select id from employment where id = ${fixture.employmentId} for update nowait`;
        await tx`select id from organization where id in (${fixture.holderOrganizationId}, ${fixture.targetOrganizationId}) for update nowait`;
        await tx`select id from "user" where id = ${fixture.userId} for update nowait`;
      });
    }
    finally {
      release.resolve();
      await Promise.allSettled([resume, ...(pause ? [pause] : [])]);
    }
    expect(await resume).toEqual({ changed: true, result: null });
    expect(await pause).toEqual({ changed: true, result: null });
    const rows = await harness!.db.select().from(organizationResponsibilityAssignments);
    expect(rows[0]!.status).toBe(OrganizationResponsibilityAssignmentStatus.Pause);
    const audits = await harness!.db.select().from(auditLogs);
    expect(audits.map(row => row.action)).toEqual([
      "admin.organization_responsibility_assignment.resume",
      "admin.organization_responsibility_assignment.pause",
    ]);
    const dirty = await harness!.db.select().from(userProfileDirty);
    expect(dirty[0]!.dirtyVersion).toBe("2");
    expect(producer).toHaveBeenCalledTimes(2);
  });

  test("proves Employment-Pause-vs-Assignment-Resume is optimistic and fails closed after the accepted anomaly", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const created = await createUseCase(fixture.now, enqueueRebuildJobs).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    const assignmentLifecycle = createLifecycleUseCase(
      fixture.now,
      enqueueRebuildJobs,
    );
    await assignmentLifecycle.execute({ command: "pause", id: created.result.id });

    const parentReachedAudit = deferred<void>();
    const releaseParent = deferred<void>();
    const parentUnitOfWork = createUnitOfWork(fixture.now, enqueueRebuildJobs);
    const parentPause = createChangeEmploymentAvailabilityUseCase({
      uow: mapUnitOfWork(parentUnitOfWork, tx => ({
        employmentStore: tx.repositories.employment,
        organizationReader: tx.repositories.organization,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userProfileInvalidation: tx.userProfileInvalidation,
        auditLogWriter: {
          recordAuditLog: async (input) => {
            if (input.action === "admin.employment.pause") {
              parentReachedAudit.resolve();
              await releaseParent.promise;
            }
            await tx.auditService.recordAuditLog(input);
          },
        },
      })),
    });

    const parent = parentPause.execute({
      command: "pause",
      employmentId: fixture.employmentId,
    });
    try {
      await waitForGateOrOperationFailure(
        parentReachedAudit.promise,
        parent,
        "Employment Pause did not complete its Assignment cascade statement",
      );
      await assignmentLifecycle.execute({ command: "resume", id: created.result.id });
      releaseParent.resolve();
      await parent;
    }
    finally {
      releaseParent.resolve();
      await parent.catch(() => undefined);
    }

    expect(
      await harness!.db
        .select({ status: employments.status })
        .from(employments)
        .where(eq(employments.id, fixture.employmentId)),
    ).toEqual([{ status: EmploymentStatus.Pause }]);
    expect(
      await harness!.db
        .select({ status: organizationResponsibilityAssignments.status })
        .from(organizationResponsibilityAssignments)
        .where(eq(organizationResponsibilityAssignments.id, created.result.id)),
    ).toEqual([{ status: OrganizationResponsibilityAssignmentStatus.Enable }]);

    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });
    await expectAssignmentReadsToFailClosed(
      service,
      created.result.id,
      "parent lifecycle is invalid",
    );
  });

  test("rolls back Organization Pause when a concurrent Assignment commits before invalidation", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const parentReachedMutation = deferred<void>();
    const releaseParent = deferred<void>();
    const parentUnitOfWork = createUnitOfWork(fixture.now, enqueueRebuildJobs);
    const organizationRepository = createAdminApiRepositories(harness!.db)
      .organization;
    const organizationService = createOrganizationService({
      organizationRepository,
      responsibilityReader: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
      uow: mapUnitOfWork(parentUnitOfWork, tx => ({
        auditService: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userProfileInvalidation: tx.userProfileInvalidation,
        organizationRepository: {
          ...tx.repositories.organization,
          updateOrganizationByCode: async (orgCode, input) => {
            parentReachedMutation.resolve();
            await releaseParent.promise;
            return await tx.repositories.organization
              .updateOrganizationByCode(orgCode, input);
          },
        },
      })),
    });

    const parent = organizationService.updateOrganizationStatus(
      "TARGET",
      OrganizationStatus.Pause,
    );
    let createdId: number | undefined;
    let parentFailure: unknown;
    try {
      await waitForGateOrOperationFailure(
        parentReachedMutation.promise,
        parent,
        "Organization Pause did not pass its subtree guard",
      );
      createdId = (await createUseCase(fixture.now, enqueueRebuildJobs).execute({
        employmentId: fixture.employmentId,
        targetOrganizationCode: "TARGET",
        typeCode: OrganizationResponsibilityTypeCode.Head,
      })).result.id;
      releaseParent.resolve();
      try {
        await parent;
      }
      catch (error) {
        parentFailure = error;
      }
    }
    finally {
      releaseParent.resolve();
      await parent.catch(() => undefined);
    }

    expect(parentFailure).toMatchObject({
      code: "ORGANIZATION_RESPONSIBILITY_INTEGRITY_FAILED",
      reason: "target-organization-not-effective",
    });
    expect(createdId).toBeNumber();
    expect(
      await harness!.db
        .select({ status: organizations.status })
        .from(organizations)
        .where(eq(organizations.id, fixture.targetOrganizationId)),
    ).toEqual([{ status: OrganizationStatus.Enable }]);
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });
    const detail = await service.detailAssignment({ id: createdId! });
    expect(detail.id).toBe(createdId!);
  });

  test("proves Organization-Pause-vs-Create is optimistic after invalidation", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const parentReachedMutation = deferred<void>();
    const releaseParent = deferred<void>();
    const parentUnitOfWork = createUnitOfWork(fixture.now, enqueueRebuildJobs);
    const organizationRepository = createAdminApiRepositories(harness!.db)
      .organization;
    const organizationService = createOrganizationService({
      organizationRepository,
      responsibilityReader: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
      uow: mapUnitOfWork(parentUnitOfWork, tx => ({
        auditService: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userProfileInvalidation: {
          recordChanges: async (
            changes: Parameters<typeof tx.userProfileInvalidation.recordChanges>[0],
          ) => {
            await tx.userProfileInvalidation.recordChanges(changes);
            parentReachedMutation.resolve();
            await releaseParent.promise;
          },
        },
        organizationRepository: tx.repositories.organization,
      })),
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    const parent = organizationService.updateOrganizationStatus(
      "TARGET",
      OrganizationStatus.Pause,
    );
    let createdId: number | undefined;
    try {
      await waitForGateOrOperationFailure(
        parentReachedMutation.promise,
        parent,
        "Organization Pause did not pass its subtree guard",
      );
      createdId = (await createUseCase(fixture.now, enqueueRebuildJobs).execute({
        employmentId: fixture.employmentId,
        targetOrganizationCode: "TARGET",
        typeCode: OrganizationResponsibilityTypeCode.Head,
      })).result.id;
      releaseParent.resolve();
      await parent;
    }
    finally {
      releaseParent.resolve();
      await parent.catch(() => undefined);
    }

    expect(createdId).toBeNumber();
    expect(
      await harness!.db
        .select({ status: organizations.status })
        .from(organizations)
        .where(eq(organizations.id, fixture.targetOrganizationId)),
    ).toEqual([{ status: OrganizationStatus.Pause }]);

    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });
    await expectAssignmentReadsToFailClosed(
      service,
      createdId!,
      "parent lifecycle is invalid",
    );
  });

  test("rolls back scoped HR lifecycle state when its audit write fails", async () => {
    const fixture = await seedScenario();
    const enqueueRebuildJobs = mock(async () => ({
      enqueued: 1,
      jobIds: ["job-1"],
    }));
    const create = createUseCase(fixture.now, enqueueRebuildJobs);
    const assignment = await create.execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db.delete(auditLogs);
    await harness!.db.delete(userProfileDirty);
    enqueueRebuildJobs.mockClear();
    const auditFailure = new Error("audit unavailable");
    const unitOfWork = createUnitOfWork(fixture.now, enqueueRebuildJobs);
    const lifecycle
      = createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
        clock: { nowDate: () => fixture.now },
        uow: mapUnitOfWork(unitOfWork, tx => ({
          assignmentStore: tx.repositories.organizationResponsibility,
          auditLogWriter: {
            recordAuditLog: async () => {
              throw auditFailure;
            },
          },
          userProfileInvalidation: tx.userProfileInvalidation,
        })),
      });
    const authorization = await createHrOrganizationResponsibilityAuthorization([
      fixture.holderOrganizationId,
      fixture.targetOrganizationId,
    ], fixture.userId);

    let caught: unknown;
    try {
      await lifecycle.execute({
        id: assignment.result.id,
        command: "pause",
      }, { authorization });
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBe(auditFailure);

    expect(
      await harness!.db
        .select({ status: organizationResponsibilityAssignments.status })
        .from(organizationResponsibilityAssignments),
    ).toEqual([{ status: OrganizationResponsibilityAssignmentStatus.Enable }]);
    expect(await harness!.db.select().from(auditLogs)).toEqual([]);
    expect(await harness!.db.select().from(userProfileDirty)).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("rolls back direct End, its audit and Dirty when invalidation fails after writing", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const created = await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    const beforeAssignments = await harness!.db.select().from(organizationResponsibilityAssignments);
    const beforeAudits = await harness!.db.select().from(auditLogs);
    const beforeDirty = await harness!.db.select().from(userProfileDirty);
    producer.mockClear();
    const sentinel = new Error("fail after real dirty write");
    const command = withTestFullOrganizationResponsibilityAuthorization(
      createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
        clock: { nowDate: () => fixture.now },
        uow: mapUnitOfWork(createUnitOfWork(fixture.now, producer), tx => ({
          assignmentStore: tx.repositories.organizationResponsibility,
          auditLogWriter: tx.auditService,
          userProfileInvalidation: { recordChanges: async (changes) => {
            await tx.userProfileInvalidation.recordChanges(changes);
            throw sentinel;
          } },
        })),
      }),
    );
    const failure = await captureFailure(() => command.execute({ id: created.result.id, command: "end" }));
    expect(failure).toBe(sentinel);
    const assignments = await harness!.db.select().from(organizationResponsibilityAssignments);
    const audits = await harness!.db.select().from(auditLogs);
    const dirty = await harness!.db.select().from(userProfileDirty);
    expect(assignments).toEqual(beforeAssignments);
    expect(audits).toEqual(beforeAudits);
    expect(dirty).toEqual(beforeDirty);
    expect(producer).not.toHaveBeenCalled();
  });

  test("paginates multiple Open supervising holders with an opaque stable-ID cursor", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const useCase = createUseCase(fixture.now, producer);
    for (const employmentId of [
      fixture.employmentId,
      fixture.secondEmploymentId,
    ]) {
      await useCase.execute({
        employmentId,
        targetOrganizationCode: "TARGET",
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
      });
    }
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    const firstPage = await service.listAssignments({
      orgCode: "TARGET",
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBe(String(firstPage.items[0]!.id));
    const secondPage = await service.listAssignments({
      orgCode: "TARGET",
      cursor: firstPage.nextCursor!,
      limit: 1,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]!.id).toBeLessThan(firstPage.items[0]!.id);
    expect(secondPage.nextCursor).toBeNull();
  });

  test("searches globally by target, Employment, Type, lifecycle, and cursor", async () => {
    const fixture = await seedScenario();
    const [head, paused, ended] = await harness!.db
      .insert(organizationResponsibilityAssignments)
      .values([
        {
          employmentId: fixture.employmentId,
          targetOrganizationId: fixture.targetOrganizationId,
          typeCode: OrganizationResponsibilityTypeCode.Head,
          status: OrganizationResponsibilityAssignmentStatus.Enable,
          startTime: fixture.now,
        },
        {
          employmentId: fixture.secondEmploymentId,
          targetOrganizationId: fixture.targetOrganizationId,
          typeCode: OrganizationResponsibilityTypeCode.Supervising,
          status: OrganizationResponsibilityAssignmentStatus.Pause,
          startTime: fixture.now,
        },
        {
          employmentId: fixture.employmentId,
          targetOrganizationId: fixture.targetOrganizationId,
          typeCode: OrganizationResponsibilityTypeCode.Supervising,
          status: OrganizationResponsibilityAssignmentStatus.Disable,
          startTime: fixture.now,
          endTime: new Date("2026-08-20T01:00:00.000Z"),
        },
      ])
      .returning({ id: organizationResponsibilityAssignments.id });
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    const globalDetail = await service.detailAssignment({ id: ended!.id });
    expect(globalDetail).toMatchObject({
      id: ended!.id,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
      targetOrganization: { orgCode: "TARGET" },
    });

    const open = await service.searchAssignments({
      lifecycle: "open",
      limit: 20,
    });
    expect(open.items.map(item => item.id)).toEqual([paused!.id, head!.id]);
    expect(open.items.map(item => item.status)).toEqual([
      OrganizationResponsibilityAssignmentStatus.Pause,
      OrganizationResponsibilityAssignmentStatus.Enable,
    ]);

    const endedPage = await service.searchAssignments({
      lifecycle: "ended",
      limit: 1,
    });
    expect(endedPage.items.map(item => item.id)).toEqual([ended!.id]);
    expect(endedPage.nextCursor).toBeNull();

    const holderHistory = await service.searchAssignments({
      employmentId: fixture.employmentId,
      lifecycle: "all",
      limit: 20,
    });
    expect(holderHistory.items.map(item => item.id)).toEqual([
      ended!.id,
      head!.id,
    ]);

    const supervising = await service.searchAssignments({
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      lifecycle: "all",
      limit: 1,
    });
    expect(supervising.items.map(item => item.id)).toEqual([ended!.id]);
    expect(supervising.nextCursor).toBe(String(ended!.id));
    const next = await service.searchAssignments({
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      lifecycle: "all",
      cursor: supervising.nextCursor!,
      limit: 1,
    });
    expect(next.items.map(item => item.id)).toEqual([paused!.id]);
    expect(next.nextCursor).toBeNull();
  });

  test("filters scoped HR reads by both endpoints before pagination and current-scope detail", async () => {
    const fixture = await seedScenario();
    const [outsideHolder] = await harness!.db
      .insert(users)
      .values({
        username: "outside-holder",
        name: "Outside Holder",
        userType: UserType.Formal,
      })
      .returning();
    const [outsidePosition] = await harness!.db
      .insert(positions)
      .values({
        posCode: "OUTSIDE",
        posName: "Outside Position",
        status: PositionStatus.Enable,
      })
      .returning();
    const [outsideEmployment] = await harness!.db
      .insert(employments)
      .values({
        userId: outsideHolder!.id,
        orgId: fixture.holderRootOrganizationId,
        posId: outsidePosition!.id,
        status: EmploymentStatus.Enable,
        startTime: fixture.now,
      })
      .returning();
    const [visibleCrossRoot, holderOnly, targetOnly, visibleHead, outside, ended]
      = await harness!.db
        .insert(organizationResponsibilityAssignments)
        .values([
          {
            employmentId: fixture.employmentId,
            targetOrganizationId: fixture.targetOrganizationId,
            typeCode: OrganizationResponsibilityTypeCode.Supervising,
            status: OrganizationResponsibilityAssignmentStatus.Enable,
            startTime: fixture.now,
          },
          {
            employmentId: fixture.employmentId,
            targetOrganizationId: fixture.holderRootOrganizationId,
            typeCode: OrganizationResponsibilityTypeCode.Supervising,
            status: OrganizationResponsibilityAssignmentStatus.Enable,
            startTime: fixture.now,
          },
          {
            employmentId: outsideEmployment!.id,
            targetOrganizationId: fixture.targetOrganizationId,
            typeCode: OrganizationResponsibilityTypeCode.Supervising,
            status: OrganizationResponsibilityAssignmentStatus.Enable,
            startTime: fixture.now,
          },
          {
            employmentId: fixture.employmentId,
            targetOrganizationId: fixture.targetOrganizationId,
            typeCode: OrganizationResponsibilityTypeCode.Head,
            status: OrganizationResponsibilityAssignmentStatus.Enable,
            startTime: fixture.now,
          },
          {
            employmentId: outsideEmployment!.id,
            targetOrganizationId: fixture.holderRootOrganizationId,
            typeCode: OrganizationResponsibilityTypeCode.Supervising,
            status: OrganizationResponsibilityAssignmentStatus.Enable,
            startTime: fixture.now,
          },
          {
            employmentId: fixture.employmentId,
            targetOrganizationId: fixture.targetOrganizationId,
            typeCode: OrganizationResponsibilityTypeCode.Supervising,
            status: OrganizationResponsibilityAssignmentStatus.Disable,
            startTime: fixture.now,
            endTime: new Date("2026-08-20T01:00:00.000Z"),
          },
        ])
        .returning({ id: organizationResponsibilityAssignments.id });
    const service = createOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });
    const authorization = await createHrOrganizationResponsibilityAuthorization([
      fixture.holderOrganizationId,
      fixture.targetOrganizationId,
    ]);

    const firstPage = await service.searchAssignments({
      lifecycle: "open",
      limit: 1,
    }, authorization);
    expect(firstPage.items.map(item => item.id)).toEqual([visibleHead!.id]);
    expect(firstPage.items[0]!.allowedActions).toEqual({
      pause: { allowed: true, reason: null },
      resume: {
        allowed: false,
        reason: "RESOURCE_STATE_NOT_ACTIONABLE",
      },
      end: { allowed: true, reason: null },
    });
    expect(firstPage.nextCursor).toBe(String(visibleHead!.id));

    const secondPage = await service.searchAssignments({
      lifecycle: "open",
      cursor: firstPage.nextCursor!,
      limit: 1,
    }, authorization);
    expect(secondPage.items.map(item => item.id)).toEqual([
      visibleCrossRoot!.id,
    ]);
    expect(secondPage.nextCursor).toBeNull();

    const numberedPage = await service.searchAssignments({
      lifecycle: "open",
      limit: 20,
      pageNum: 2,
      pageSize: 1,
    }, authorization);
    expect(numberedPage.total).toBe(2);
    expect(numberedPage.items.map(item => item.id)).toEqual([visibleCrossRoot!.id]);
    const emptyPage = await service.searchAssignments({
      lifecycle: "open",
      limit: 20,
      pageNum: 3,
      pageSize: 1,
    }, authorization);
    expect(emptyPage).toEqual({ items: [], total: 2, nextCursor: null });
    const filteredPage = await service.searchAssignments({
      targetOrganizationCode: "TARGET",
      employmentId: fixture.employmentId,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      lifecycle: "all",
      limit: 20,
      pageNum: 1,
      pageSize: 10,
    }, authorization);
    expect(filteredPage.total).toBe(1);
    expect(filteredPage.items.map(item => item.id)).toEqual([visibleHead!.id]);

    const targetList = await service.listAssignments({
      orgCode: "TARGET",
      lifecycle: "open",
      limit: 20,
    }, authorization);
    expect(targetList.items.map(item => item.id)).toEqual([
      visibleHead!.id,
      visibleCrossRoot!.id,
    ]);
    const narrowed = await service.searchAssignments({
      targetOrganizationCode: "TARGET",
      employmentId: fixture.employmentId,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      lifecycle: "all",
      limit: 20,
    }, authorization);
    expect(narrowed.items.map(item => item.id)).toEqual([visibleHead!.id]);

    const outOfScopeTarget = await service.listAssignments({
      orgCode: "HOLDER_ROOT",
      lifecycle: "all",
      limit: 20,
    }, authorization);
    expect(outOfScopeTarget.items).toEqual([]);
    const outOfScopeEmployment = await service.searchAssignments({
      employmentId: outsideEmployment!.id,
      lifecycle: "all",
      limit: 20,
    }, authorization);
    expect(outOfScopeEmployment.items).toEqual([]);

    const endedPage = await service.searchAssignments({
      lifecycle: "ended",
      limit: 20,
    }, authorization);
    expect(endedPage.items.map(item => item.id)).toEqual([ended!.id]);
    const visibleDetail = await service.detailAssignment(
      { id: ended!.id },
      authorization,
    );
    expect(visibleDetail.id).toBe(ended!.id);

    const [orphanTarget] = await harness!.db
      .insert(organizations)
      .values({
        orgCode: "ORPHAN_TARGET",
        orgName: "Orphan Target",
        path: "/pending",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Department,
        status: OrganizationStatus.Enable,
      })
      .returning();
    await harness!.db
      .update(organizations)
      .set({ path: `/${orphanTarget!.id}` })
      .where(eq(organizations.id, orphanTarget!.id));
    await harness!.db.insert(organizationClosures).values({
      ancestorId: orphanTarget!.id,
      descendantId: orphanTarget!.id,
      depth: 0,
    });
    await harness!.db.insert(organizationResponsibilityAssignments).values({
      employmentId: outsideEmployment!.id,
      targetOrganizationId: orphanTarget!.id,
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: fixture.now,
    });
    await harness!.db
      .delete(organizations)
      .where(eq(organizations.id, orphanTarget!.id));
    const visibleTargetDespiteHiddenOrphan = await service.listAssignments({
      orgCode: "TARGET",
      lifecycle: "open",
      limit: 20,
    }, authorization);
    expect(visibleTargetDespiteHiddenOrphan.items.map(item => item.id)).toEqual([
      visibleHead!.id,
      visibleCrossRoot!.id,
    ]);

    for (const hiddenId of [holderOnly!.id, targetOnly!.id, outside!.id]) {
      let failure: unknown;
      try {
        await service.detailAssignment({ id: hiddenId }, authorization);
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(
        OrganizationResponsibilityAssignmentNotFoundError,
      );
    }

    const reducedAuthorization
      = await createHrOrganizationResponsibilityAuthorization([
        fixture.holderOrganizationId,
      ]);
    const afterScopeLoss = await service.searchAssignments({
      lifecycle: "all",
      limit: 20,
    }, reducedAuthorization);
    expect(afterScopeLoss.items).toEqual([]);
    let scopeLossDetailFailure: unknown;
    try {
      await service.detailAssignment({ id: ended!.id }, reducedAuthorization);
    }
    catch (error) {
      scopeLossDetailFailure = error;
    }
    expect(scopeLossDetailFailure).toBeInstanceOf(
      OrganizationResponsibilityAssignmentNotFoundError,
    );
  });

  test("fails closed when an Assignment references a deleted management row", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db
      .update(users)
      .set({ isDelete: true })
      .where(eq(users.id, fixture.userId));
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    let caught: unknown;
    try {
      await service.listAssignments({ orgCode: "TARGET", limit: 20 });
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("has no valid User");
  });

  test("fails list and detail closed when the target Organization is deleted", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const created = await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db
      .update(organizations)
      .set({ isDelete: true })
      .where(eq(organizations.id, fixture.targetOrganizationId));
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    await expectAssignmentReadsToFailClosed(
      service,
      created.result.id,
      "has no valid target Organization",
    );
  });

  test("fails list and detail closed when the target Organization reference is missing", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const created = await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db
      .delete(organizations)
      .where(eq(organizations.id, fixture.targetOrganizationId));
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    await expectAssignmentReadsToFailClosed(
      service,
      created.result.id,
      "has no valid target Organization",
    );
  });

  test("fails stable-ID detail closed when an Ended Assignment target reference is missing", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const created = await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db
      .update(organizationResponsibilityAssignments)
      .set({
        status: OrganizationResponsibilityAssignmentStatus.Disable,
        endTime: new Date(fixture.now.getTime() + 1_000),
      })
      .where(eq(organizationResponsibilityAssignments.id, created.result.id));
    await harness!.db
      .delete(organizations)
      .where(eq(organizations.id, fixture.targetOrganizationId));
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    let caught: unknown;
    try {
      await service.detailAssignment({ orgCode: "TARGET", id: created.result.id });
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(
      "has no valid target Organization",
    );
  });

  test("fails list and detail closed when the holder Organization path is truncated", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const created = await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db
      .delete(organizationClosures)
      .where(
        and(
          eq(organizationClosures.ancestorId, fixture.holderRootOrganizationId),
          eq(organizationClosures.descendantId, fixture.holderOrganizationId),
        ),
      );
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    await expectAssignmentReadsToFailClosed(
      service,
      created.result.id,
      "has no valid holder Organization path",
    );
  });

  test("fails list and detail closed when the target Organization path is truncated", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const created = await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    await harness!.db
      .delete(organizationClosures)
      .where(
        and(
          eq(organizationClosures.ancestorId, fixture.targetOrganizationId),
          eq(organizationClosures.descendantId, fixture.targetOrganizationId),
        ),
      );
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    await expectAssignmentReadsToFailClosed(
      service,
      created.result.id,
      "has no valid target Organization path",
    );
  });

  test("fails list and detail closed when an Open Assignment drifts from parent lifecycle", async () => {
    const fixture = await seedScenario();
    const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
    const created = await createUseCase(fixture.now, producer).execute({
      employmentId: fixture.employmentId,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    const service = createFullAdminOrganizationResponsibilityService({
      repository: createAdminApiRepositories(harness!.db)
        .organizationResponsibility,
    });

    await harness!.db
      .update(employments)
      .set({ status: EmploymentStatus.Pause })
      .where(eq(employments.id, fixture.employmentId));
    await expectAssignmentReadsToFailClosed(
      service,
      created.result.id,
      "parent lifecycle is invalid",
    );

    await harness!.db
      .update(employments)
      .set({ status: EmploymentStatus.Enable })
      .where(eq(employments.id, fixture.employmentId));
    await harness!.db
      .update(organizations)
      .set({ status: OrganizationStatus.Pause })
      .where(eq(organizations.id, fixture.targetOrganizationId));
    await expectAssignmentReadsToFailClosed(
      service,
      created.result.id,
      "parent lifecycle is invalid",
    );
  });

  for (const scope of ["full", "hr"] as const) {
    for (const typeCode of [OrganizationResponsibilityTypeCode.Head, OrganizationResponsibilityTypeCode.Supervising]) {
      test(`${scope} concurrent ${typeCode} inserts arbitrate through real Drizzle constraints with safe errors`, async () => {
        const fixture = await seedScenario();
        const producer = mock(async () => ({ enqueued: 1, jobIds: ["job-1"] }));
        const bothPrechecked = deferred<void>();
        const release = deferred<void>();
        let entrants = 0;
        const beforeInsert = async () => {
          entrants += 1;
          if (entrants === 2)
            bothPrechecked.resolve();
          await release.promise;
        };
        const command = createRawUseCase(fixture.now, producer, mock(), beforeInsert);
        const authorization = scope === "full"
          ? testFullOrganizationResponsibilityAuthorization
          : await createHrOrganizationResponsibilityAuthorization([
              fixture.holderOrganizationId,
              fixture.targetOrganizationId,
            ], fixture.userId);
        const first = command.execute({
          employmentId: fixture.employmentId,
          targetOrganizationCode: "TARGET",
          typeCode,
        }, { authorization });
        const second = command.execute({
          employmentId: typeCode === OrganizationResponsibilityTypeCode.Head
            ? fixture.secondEmploymentId
            : fixture.employmentId,
          targetOrganizationCode: "TARGET",
          typeCode,
        }, { authorization });
        const resultsPending = Promise.allSettled([first, second]);
        try {
          await waitForGateOrOperationFailure(bothPrechecked.promise, resultsPending, "both creates did not finish ordinary prechecks");
          await harness!.sql.begin(async (tx) => {
            await tx`select id from employment where id in (${fixture.employmentId}, ${fixture.secondEmploymentId}) for update nowait`;
            await tx`select id from organization where id = ${fixture.targetOrganizationId} for update nowait`;
          });
        }
        finally {
          release.resolve();
          await resultsPending;
        }
        const results = await resultsPending;
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        const rejection = results.find(result => result.status === "rejected");
        expect(rejection?.status).toBe("rejected");
        if (rejection?.status !== "rejected")
          throw new Error("expected unique constraint loser");
        expect(rejection.reason).toBeInstanceOf(typeCode === OrganizationResponsibilityTypeCode.Supervising
          ? OrganizationResponsibilityAssignmentDuplicateOpenError
          : scope === "hr"
            ? OrganizationResponsibilityAssignmentUnmanageableConflictError
            : OrganizationResponsibilityAssignmentCardinalityConflictError);
        expect(rejection.reason).toMatchObject({ httpStatus: 409 });
        expect(JSON.stringify(rejection.reason)).not.toContain("constraint");
        const assignments = await harness!.db.select().from(organizationResponsibilityAssignments);
        const audits = await harness!.db.select().from(auditLogs);
        const dirty = await harness!.db.select().from(userProfileDirty);
        expect(assignments).toHaveLength(1);
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ targetId: assignments[0]!.id, details: { changed: true } });
        expect(dirty).toHaveLength(1);
        expect(dirty[0]!.dirtyVersion).toBe("1");
        expect(producer).toHaveBeenCalledTimes(1);
      });
    }
  }
});

async function expectAssignmentReadsToFailClosed(
  service: ReturnType<typeof createFullAdminOrganizationResponsibilityService>,
  assignmentId: number,
  expectedMessage: string,
) {
  for (const read of [
    () => service.listAssignments({ orgCode: "TARGET", limit: 20 }),
    () => service.detailAssignment({ orgCode: "TARGET", id: assignmentId }),
  ]) {
    let caught: unknown;
    try {
      await read();
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(expectedMessage);
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitForGateOrOperationFailure<T>(
  gate: Promise<void>,
  operation: Promise<T>,
  timeoutMessage: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      gate,
      operation.then(
        () => {
          throw new Error("operation completed before reaching its test gate");
        },
        (error: unknown) => {
          throw error;
        },
      ),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), 5_000);
      }),
    ]);
  }
  finally {
    if (timeout !== undefined)
      clearTimeout(timeout);
  }
}

function createUnitOfWork(
  now: Date,
  enqueueRebuildJobs: (payloads: never) => Promise<unknown>,
  warn = mock(() => undefined),
  db: DbClient = harness!.db,
) {
  return createAdminApiUnitOfWork({
    db,
    logger: { error: mock(() => undefined), warn },
    userProfileJobProducer: { enqueueRebuildJobs } as never,
    clock: { nowDate: () => now },
  });
}

function createFullAdminOrganizationResponsibilityService(
  deps: Parameters<typeof createOrganizationResponsibilityService>[0],
) {
  const service = createOrganizationResponsibilityService(deps);
  return {
    listAssignments: (
      input: Parameters<typeof service.listAssignments>[0],
    ) => service.listAssignments(
      input,
      testFullOrganizationResponsibilityAuthorization,
    ),
    searchAssignments: (
      input: Parameters<typeof service.searchAssignments>[0],
    ) => service.searchAssignments(
      input,
      testFullOrganizationResponsibilityAuthorization,
    ),
    detailAssignment: (
      input: Parameters<typeof service.detailAssignment>[0],
    ) => service.detailAssignment(
      input,
      testFullOrganizationResponsibilityAuthorization,
    ),
  };
}

async function createHrOrganizationResponsibilityAuthorization(
  organizationIds: readonly number[],
  actorUserId = 7,
) {
  return await createAdminAuthorizationPolicy({
    logger: { warn: mock() },
    hrAdministrationScopeResolver: {
      resolveForActor: async () => ({
        rootOrganizationIds: organizationIds,
        organizationIds,
      }),
    },
  }).getOrganizationResponsibilityAuthorization({
    userId: actorUserId,
    username: "hr-reader",
    roles: ["iam:hr-admin"],
  });
}

function createUseCase(
  now: Date,
  enqueueRebuildJobs: (payloads: never) => Promise<unknown>,
  warn = mock(() => undefined),
) {
  return withTestFullOrganizationResponsibilityAuthorization(
    createRawUseCase(now, enqueueRebuildJobs, warn),
  );
}

function createRawUseCase(
  now: Date,
  enqueueRebuildJobs: (payloads: never) => Promise<unknown>,
  warn = mock(() => undefined),
  beforeInsert?: () => Promise<void>,
) {
  const unitOfWork = createUnitOfWork(now, enqueueRebuildJobs, warn);
  return createCreateOrganizationResponsibilityAssignmentUseCase({
    clock: { nowDate: () => now },
    uow: mapUnitOfWork(unitOfWork, tx => ({
      assignmentStore: {
        ...tx.repositories.organizationResponsibility,
        createAssignmentRecord: async (input, readScope) => {
          await beforeInsert?.();
          return await tx.repositories.organizationResponsibility.createAssignmentRecord(input, readScope);
        },
      },
      auditLogWriter: tx.auditService,
      employmentReader: tx.repositories.organizationResponsibility,
      organizationReader: tx.repositories.organizationResponsibility,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
}

function createLifecycleUseCase(
  now: Date,
  enqueueRebuildJobs: (payloads: never) => Promise<unknown>,
  warn = mock(() => undefined),
  db: DbClient = harness!.db,
) {
  return withTestFullOrganizationResponsibilityAuthorization(
    createRawLifecycleUseCase(now, enqueueRebuildJobs, warn, db),
  );
}

function createRawLifecycleUseCase(
  now: Date,
  enqueueRebuildJobs: (payloads: never) => Promise<unknown>,
  warn = mock(() => undefined),
  db: DbClient = harness!.db,
) {
  const unitOfWork = createUnitOfWork(now, enqueueRebuildJobs, warn, db);
  return createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
    clock: { nowDate: () => now },
    uow: mapUnitOfWork(unitOfWork, tx => ({
      assignmentStore: tx.repositories.organizationResponsibility,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
}

function createEmploymentAvailabilityUseCase(
  now: Date,
  enqueueRebuildJobs: (payloads: never) => Promise<unknown>,
) {
  const unitOfWork = createUnitOfWork(now, enqueueRebuildJobs);
  return createChangeEmploymentAvailabilityUseCase({
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      auditLogWriter: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
}

async function waitForBlockedPostgresQuery(queryFragment: string) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const [activity] = await harness!.sql<{ found: boolean }[]>`
      select exists(
        select 1
        from pg_stat_activity
        where pid <> pg_backend_pid()
          and wait_event_type = 'Lock'
          and query like ${`%${queryFragment}%`}
      ) as found
    `;
    if (activity?.found)
      return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`PostgreSQL query did not block on the expected row lock: ${queryFragment}`);
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  }
  catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

function createPostgresSubjectAccessLifecycle(
  subjectIdentifier: string,
  now: Date,
) {
  const random = { uuid: randomUUID };
  const barrier = createSubjectAccessBarrier({
    clock: { nowDate: () => now },
    random,
    store: createInMemorySubjectAccessStore([{
      version: 1,
      subjectIdentifier,
      state: "enabled",
      transitionId: "20000000-0000-4000-8000-000000000001",
      updatedAt: now.toISOString(),
    }]),
  });
  return createSubjectAccessLifecycle({
    barrier,
    logger: { warn: mock() },
    random,
    transitionIntent: createSubjectAccessTransitionRepository(harness!.db),
  });
}

async function createHolderRootUserAuthorization(fixture: {
  holderOrganizationId: number;
  holderRootOrganizationId: number;
  userId: number;
}) {
  return await createAdminAuthorizationPolicy({
    logger: { warn: mock() },
    hrAdministrationScopeResolver: {
      resolveForActor: async () => ({
        rootOrganizationIds: [fixture.holderRootOrganizationId],
        organizationIds: [
          fixture.holderRootOrganizationId,
          fixture.holderOrganizationId,
        ],
      }),
    },
  }).getUserAuthorization({
    userId: fixture.userId,
    username: "holder",
    roles: ["iam:hr-admin"],
  });
}

async function seedScenario() {
  const now = new Date("2026-08-20T00:00:00.000Z");
  const [user, secondUser] = await harness!.db
    .insert(users)
    .values([
      { username: "holder", name: "Holder", userType: UserType.Formal },
      {
        username: "second-holder",
        name: "Second Holder",
        userType: UserType.Formal,
      },
    ])
    .returning();
  const [holderRootOrganization, holderOrganization, targetOrganization]
    = await harness!.db
      .insert(organizations)
      .values([
        {
          orgCode: "HOLDER_ROOT",
          orgName: "Holder Root Organization",
          path: "/pending",
          level: OrganizationLevel.One,
          orgType: OrganizationType.Department,
          status: OrganizationStatus.Enable,
        },
        {
          orgCode: "HOLDER",
          orgName: "Holder Organization",
          path: "/pending",
          level: OrganizationLevel.Two,
          orgType: OrganizationType.Department,
          status: OrganizationStatus.Enable,
        },
        {
          orgCode: "TARGET",
          orgName: "Target Organization",
          path: "/pending",
          level: OrganizationLevel.One,
          orgType: OrganizationType.Department,
          status: OrganizationStatus.Enable,
        },
      ])
      .returning();
  await harness!.db
    .update(organizations)
    .set({
      path: `/${holderRootOrganization!.id}`,
    })
    .where(eq(organizations.id, holderRootOrganization!.id));
  await harness!.db
    .update(organizations)
    .set({
      parentId: holderRootOrganization!.id,
      path: `/${holderRootOrganization!.id}/${holderOrganization!.id}`,
    })
    .where(eq(organizations.id, holderOrganization!.id));
  await harness!.db
    .update(organizations)
    .set({
      path: `/${targetOrganization!.id}`,
    })
    .where(eq(organizations.id, targetOrganization!.id));
  await harness!.db.insert(organizationClosures).values([
    {
      ancestorId: holderRootOrganization!.id,
      descendantId: holderRootOrganization!.id,
      depth: 0,
    },
    {
      ancestorId: holderRootOrganization!.id,
      descendantId: holderOrganization!.id,
      depth: 1,
    },
    {
      ancestorId: holderOrganization!.id,
      descendantId: holderOrganization!.id,
      depth: 0,
    },
    {
      ancestorId: targetOrganization!.id,
      descendantId: targetOrganization!.id,
      depth: 0,
    },
  ]);
  const [position, secondPosition] = await harness!.db
    .insert(positions)
    .values([
      {
        posCode: "POSITION",
        posName: "Position",
        status: PositionStatus.Enable,
      },
      {
        posCode: "SECOND",
        posName: "Second Position",
        status: PositionStatus.Enable,
      },
    ])
    .returning();
  const [employment, secondEmployment] = await harness!.db
    .insert(employments)
    .values([
      {
        userId: user!.id,
        orgId: holderOrganization!.id,
        posId: position!.id,
        status: EmploymentStatus.Enable,
        startTime: now,
      },
      {
        userId: secondUser!.id,
        orgId: holderOrganization!.id,
        posId: secondPosition!.id,
        status: EmploymentStatus.Enable,
        startTime: now,
      },
    ])
    .returning();

  return {
    now,
    userId: user!.id,
    secondUserId: secondUser!.id,
    employmentId: employment!.id,
    secondEmploymentId: secondEmployment!.id,
    holderRootOrganizationId: holderRootOrganization!.id,
    holderOrganizationId: holderOrganization!.id,
    targetOrganizationId: targetOrganization!.id,
  };
}

async function seedOutsideEmployment(now: Date) {
  const suffix = randomUUID().slice(0, 8);
  const [outsideUser] = await harness!.db
    .insert(users)
    .values({
      username: `outside-${suffix}`,
      name: "Outside Holder",
      userType: UserType.Formal,
    })
    .returning();
  const [outsideOrganization] = await harness!.db
    .insert(organizations)
    .values({
      orgCode: `OUTSIDE_${suffix}`,
      orgName: "Outside Organization",
      path: "/pending",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
      status: OrganizationStatus.Enable,
    })
    .returning();
  await harness!.db
    .update(organizations)
    .set({ path: `/${outsideOrganization!.id}` })
    .where(eq(organizations.id, outsideOrganization!.id));
  await harness!.db.insert(organizationClosures).values({
    ancestorId: outsideOrganization!.id,
    descendantId: outsideOrganization!.id,
    depth: 0,
  });
  const [outsidePosition] = await harness!.db
    .insert(positions)
    .values({
      posCode: `OUT_${suffix}`,
      posName: "Outside Position",
      status: PositionStatus.Enable,
    })
    .returning();
  const [outsideEmployment] = await harness!.db
    .insert(employments)
    .values({
      userId: outsideUser!.id,
      orgId: outsideOrganization!.id,
      posId: outsidePosition!.id,
      status: EmploymentStatus.Enable,
      startTime: now,
    })
    .returning();
  return {
    employmentId: outsideEmployment!.id,
    organizationCode: outsideOrganization!.orgCode,
    organizationId: outsideOrganization!.id,
    userId: outsideUser!.id,
  };
}
