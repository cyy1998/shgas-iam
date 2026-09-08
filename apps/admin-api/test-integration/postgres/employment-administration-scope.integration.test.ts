import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { DbClient } from "@iam/db";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { createManagePrimaryEmploymentUseCase } from "@admin-api/use-cases/employment/manage-primary-employment/manage-primary-employment.use-case";
import { createTransferEmploymentUseCase } from "@admin-api/use-cases/employment/transfer-employment/transfer-employment.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
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
  userProfileDirty,
  users,
} from "@iam/db/schema";
import {
  EmploymentAlreadyExistsError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { createTestHrEmploymentAuthorization } from "../helpers/hr-employment-authorization";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;
let seeded: Awaited<ReturnType<typeof seedEmploymentGraph>>;

beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness.reset();
  seeded = await seedEmploymentGraph(harness.db);
});

afterAll(async () => {
  await harness.close();
});

describe("HR Employment administration scope", () => {
  test("filters assigned Organization before pagination and supports explicit ended history", async () => {
    const { service } = createSubject();
    const denyMutation = mock(() => {
      throw new EmploymentNotFoundError();
    });
    const authorization = await scopedAuthorization(denyMutation);

    const firstPage = await service.searchEmploymentsFuzzyForAdmin(
      query(1, 1),
      authorization,
    );
    const secondPage = await service.searchEmploymentsFuzzyForAdmin(
      query(2, 1),
      authorization,
    );
    const ended = await service.searchEmploymentsFuzzyForAdmin(
      query(1, 10, [EmploymentStatus.Disable]),
      authorization,
    );
    const detail = await service.getEmploymentDetailByIdForAdmin(
      seeded.inScopeEnabledId,
      authorization,
    );

    expect(firstPage).toMatchObject({ total: 2, pages: 2, pageNum: 1 });
    expect(secondPage).toMatchObject({ total: 2, pages: 2, pageNum: 2 });
    expect([
      firstPage.result[0]?.id,
      secondPage.result[0]?.id,
    ].sort()).toEqual([
      seeded.inScopeEnabledId,
      seeded.inScopePausedId,
    ].sort());
    expect(ended).toMatchObject({
      total: 1,
      result: [{ id: seeded.inScopeEndedId }],
    });
    expect(detail.id).toBe(seeded.inScopeEnabledId);

    for (const id of [seeded.outOfScopeId, seeded.tombstoneId]) {
      let failure: unknown;
      try {
        await service.getEmploymentDetailByIdForAdmin(id, authorization);
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(EmploymentNotFoundError);
    }

    await service.guardEmploymentMutationForAdmin(
      seeded.inScopeEnabledId,
      "admin.employment.pause",
      authorization,
    );
    for (const id of [seeded.outOfScopeId, seeded.tombstoneId]) {
      let failure: unknown;
      try {
        await service.guardEmploymentMutationForAdmin(
          id,
          "admin.employment.pause",
          authorization,
        );
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(EmploymentNotFoundError);
    }
    for (const [callIndex, resourceIdentifier] of [
      [1, seeded.outOfScopeId],
      [2, seeded.tombstoneId],
    ] as const) {
      expect(denyMutation).toHaveBeenNthCalledWith(callIndex, {
        operationId: "admin.employment.pause",
        resourceIdentifier,
        reason: "RESOURCE_OUT_OF_SCOPE",
        concealExistence: true,
      });
    }
  });

  test("commits scoped description and creation while denied and duplicate mutations write nothing", async () => {
    const { service, createEmployment } = createSubject();
    const authorization = await scopedAuthorization();

    const updated = await service.updateEmployment(
      seeded.inScopeEnabledId,
      { description: "HR approved" },
      undefined,
      authorization,
    );
    expect(updated).toEqual({ changed: true, result: null });
    const updatedRows = await harness.db
      .select({ description: employments.description })
      .from(employments)
      .where(eq(employments.id, seeded.inScopeEnabledId));
    expect(updatedRows).toEqual([{ description: "HR approved" }]);

    let deniedUpdate: unknown;
    try {
      await service.updateEmployment(
        seeded.outOfScopeId,
        { description: "forbidden" },
        undefined,
        authorization,
      );
    }
    catch (error) {
      deniedUpdate = error;
    }
    expect(deniedUpdate).toBeInstanceOf(EmploymentNotFoundError);
    const outOfScopeRows = await harness.db
      .select({ description: employments.description })
      .from(employments)
      .where(eq(employments.id, seeded.outOfScopeId));
    expect(outOfScopeRows).toEqual([{ description: "outside" }]);

    const created = await createEmployment.execute(
      {
        username: "candidate",
        orgCode: "IN",
        posCode: "GLOBAL",
        description: "created by HR",
      },
      { authorization },
    );
    const createdRows = await harness.db
      .select({ orgId: employments.orgId, description: employments.description })
      .from(employments)
      .where(eq(employments.id, created.result.id));
    expect(createdRows).toEqual([{
      orgId: seeded.inScopeOrgId,
      description: "created by HR",
    }]);

    let deniedCreate: unknown;
    try {
      await createEmployment.execute(
        {
          username: "outside-candidate",
          orgCode: "OUT",
          posCode: "GLOBAL",
        },
        { authorization },
      );
    }
    catch (error) {
      deniedCreate = error;
    }
    expect(deniedCreate).toBeInstanceOf(EmploymentNotFoundError);
    const deniedCreateRows = await harness.db
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.userId, seeded.outsideCandidateUserId));
    expect(deniedCreateRows).toEqual([]);

    let duplicate: unknown;
    try {
      await createEmployment.execute(
        {
          username: "candidate",
          orgCode: "IN",
          posCode: "GLOBAL",
        },
        { authorization },
      );
    }
    catch (error) {
      duplicate = error;
    }
    expect(duplicate).toBeInstanceOf(EmploymentAlreadyExistsError);
    const candidateRows = await harness.db
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.userId, seeded.candidateUserId));
    expect(candidateRows).toHaveLength(1);
  });

  test("atomically executes scoped lifecycle commands and cascades responsibilities outside HR scope", async () => {
    const { changeEmploymentAvailability, endEmployment, service } = createSubject();
    const authorization = await scopedAuthorization();
    await harness.db.insert(organizationResponsibilityAssignments).values([
      {
        employmentId: seeded.inScopeEnabledId,
        targetOrganizationId: seeded.outOfScopeOrgId,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        startTime: new Date("2026-01-01T00:00:00Z"),
      },
      {
        employmentId: seeded.inScopePausedId,
        targetOrganizationId: seeded.outOfScopeOrgId,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        status: OrganizationResponsibilityAssignmentStatus.Pause,
        startTime: new Date("2026-01-01T00:00:00Z"),
      },
      {
        employmentId: seeded.outOfScopeId,
        targetOrganizationId: seeded.inScopeOrgId,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        startTime: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    let outOfScopeFailure: unknown;
    try {
      await service.guardEmploymentMutationForAdmin(
        seeded.outOfScopeId,
        "admin.employment.end",
        authorization,
      );
      await endEmployment.execute({ employmentId: seeded.outOfScopeId });
    }
    catch (error) {
      outOfScopeFailure = error;
    }
    expect(outOfScopeFailure).toBeInstanceOf(EmploymentNotFoundError);

    await service.guardEmploymentMutationForAdmin(
      seeded.inScopeEnabledId,
      "admin.employment.pause",
      authorization,
    );
    const paused = await changeEmploymentAvailability.execute({
      command: "pause",
      employmentId: seeded.inScopeEnabledId,
    });
    expect(paused).toEqual({ changed: true, result: null });

    await service.guardEmploymentMutationForAdmin(
      seeded.inScopeEnabledId,
      "admin.employment.resume",
      authorization,
    );
    const resumed = await changeEmploymentAvailability.execute({
      command: "resume",
      employmentId: seeded.inScopeEnabledId,
      expectedAncestorOrgCode: "IN",
    });
    expect(resumed).toEqual({ changed: true, result: null });

    await service.guardEmploymentMutationForAdmin(
      seeded.inScopePausedId,
      "admin.employment.end",
      authorization,
    );
    const ended = await endEmployment.execute({
      employmentId: seeded.inScopePausedId,
    });
    expect(ended).toEqual({ changed: true, result: null });

    const employmentRows = await harness.db
      .select({ id: employments.id, status: employments.status })
      .from(employments)
      .where(eq(employments.orgId, seeded.inScopeOrgId));
    expect(employmentRows).toEqual(expect.arrayContaining([
      { id: seeded.inScopeEnabledId, status: EmploymentStatus.Enable },
      { id: seeded.inScopePausedId, status: EmploymentStatus.Disable },
    ]));
    expect(await harness.db
      .select({ status: employments.status })
      .from(employments)
      .where(eq(employments.id, seeded.outOfScopeId)))
      .toEqual([{ status: EmploymentStatus.Enable }]);
    const assignmentRows = await harness.db
      .select({
        employmentId: organizationResponsibilityAssignments.employmentId,
        status: organizationResponsibilityAssignments.status,
        targetOrganizationId:
          organizationResponsibilityAssignments.targetOrganizationId,
      })
      .from(organizationResponsibilityAssignments);
    expect(assignmentRows).toEqual(expect.arrayContaining([
      {
        employmentId: seeded.inScopeEnabledId,
        status: OrganizationResponsibilityAssignmentStatus.Pause,
        targetOrganizationId: seeded.outOfScopeOrgId,
      },
      {
        employmentId: seeded.inScopePausedId,
        status: OrganizationResponsibilityAssignmentStatus.Disable,
        targetOrganizationId: seeded.outOfScopeOrgId,
      },
      {
        employmentId: seeded.outOfScopeId,
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        targetOrganizationId: seeded.inScopeOrgId,
      },
    ]));
    expect(await harness.db.select({ action: auditLogs.action }).from(auditLogs))
      .toEqual(expect.arrayContaining([
        { action: "admin.organization_responsibility_assignment.pause" },
        { action: "admin.employment.pause" },
        { action: "admin.employment.resume" },
        { action: "admin.organization_responsibility_assignment.end" },
        { action: "admin.employment.end" },
      ]));
    expect(await harness.db.select({ userId: userProfileDirty.userId }).from(userProfileDirty))
      .toEqual(expect.arrayContaining([
        { userId: seeded.inScopeEnabledUserId },
        { userId: seeded.inScopePausedUserId },
      ]));
    expect(await harness.db
      .select({ userId: userProfileDirty.userId })
      .from(userProfileDirty)
      .where(eq(userProfileDirty.userId, seeded.outOfScopeUserId)))
      .toEqual([]);
  });

  test("transfers across authorized roots while both out-of-scope directions remain no-write", async () => {
    const { transferEmployment } = createSubject();
    const authorization = await createTestHrEmploymentAuthorization({
      rootOrganizationIds: [seeded.inScopeOrgId, seeded.secondScopeOrgId],
      organizationIds: [
        seeded.inScopeOrgId,
        seeded.inScopeChildOrgId,
        seeded.secondScopeOrgId,
      ],
      denyMutation: () => {
        throw new EmploymentNotFoundError();
      },
    });
    await harness.db.insert(organizationResponsibilityAssignments).values({
      employmentId: seeded.inScopeEnabledId,
      targetOrganizationId: seeded.outOfScopeOrgId,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-01-01T00:00:00Z"),
    });
    const employmentFactsBeforeDenials = await harness.db
      .select({
        id: employments.id,
        orgId: employments.orgId,
        status: employments.status,
        isPrimary: employments.isPrimary,
        endTime: employments.endTime,
      })
      .from(employments)
      .orderBy(asc(employments.id));

    let destinationFailure: unknown;
    try {
      await transferEmployment.execute({
        employmentId: seeded.inScopeEnabledId,
        newOrgCode: "OUT",
        expectedAncestorOrgCode: "OUT",
        newPosCode: "GLOBAL",
        isPrimary: false,
      }, { authorization });
    }
    catch (error) {
      destinationFailure = error;
    }
    expect(destinationFailure).toBeInstanceOf(EmploymentNotFoundError);

    let sourceFailure: unknown;
    try {
      await transferEmployment.execute({
        employmentId: seeded.outOfScopeId,
        newOrgCode: "IN_TWO",
        expectedAncestorOrgCode: "IN_TWO",
        newPosCode: "GLOBAL",
        isPrimary: false,
      }, { authorization });
    }
    catch (error) {
      sourceFailure = error;
    }
    expect(sourceFailure).toBeInstanceOf(EmploymentNotFoundError);
    const employmentFactsAfterDenials = await harness.db
      .select({
        id: employments.id,
        orgId: employments.orgId,
        status: employments.status,
        isPrimary: employments.isPrimary,
        endTime: employments.endTime,
      })
      .from(employments)
      .orderBy(asc(employments.id));
    expect(employmentFactsAfterDenials).toEqual(employmentFactsBeforeDenials);
    expect(await harness.db.select({ action: auditLogs.action }).from(auditLogs)).toEqual([]);
    expect(await harness.db.select({ userId: userProfileDirty.userId }).from(userProfileDirty))
      .toEqual([]);
    expect(await harness.db
      .select({ status: organizationResponsibilityAssignments.status })
      .from(organizationResponsibilityAssignments)
      .where(eq(
        organizationResponsibilityAssignments.employmentId,
        seeded.inScopeEnabledId,
      )))
      .toEqual([{ status: OrganizationResponsibilityAssignmentStatus.Enable }]);

    const sameRootTransfer = await transferEmployment.execute({
      employmentId: seeded.inScopePausedId,
      newOrgCode: "IN_CHILD",
      expectedAncestorOrgCode: "IN",
      newPosCode: "GLOBAL",
      isPrimary: false,
    }, { authorization });
    expect(await harness.db
      .select({
        id: employments.id,
        orgId: employments.orgId,
        status: employments.status,
      })
      .from(employments)
      .where(eq(employments.id, sameRootTransfer.result.id)))
      .toEqual([{
        id: sameRootTransfer.result.id,
        orgId: seeded.inScopeChildOrgId,
        status: EmploymentStatus.Enable,
      }]);

    const transferred = await transferEmployment.execute({
      employmentId: seeded.inScopeEnabledId,
      newOrgCode: "IN_TWO",
      expectedAncestorOrgCode: "IN_TWO",
      newPosCode: "GLOBAL",
      isPrimary: true,
      description: "cross-root transfer",
    }, { authorization });

    expect(await harness.db
      .select({
        id: employments.id,
        orgId: employments.orgId,
        status: employments.status,
        isPrimary: employments.isPrimary,
        description: employments.description,
      })
      .from(employments)
      .where(eq(employments.id, seeded.inScopeEnabledId)))
      .toEqual([{
        id: seeded.inScopeEnabledId,
        orgId: seeded.inScopeOrgId,
        status: EmploymentStatus.Disable,
        isPrimary: false,
        description: null,
      }]);
    expect(await harness.db
      .select({
        id: employments.id,
        orgId: employments.orgId,
        posId: employments.posId,
        status: employments.status,
        isPrimary: employments.isPrimary,
        description: employments.description,
      })
      .from(employments)
      .where(eq(employments.id, transferred.result.id)))
      .toEqual([{
        id: transferred.result.id,
        orgId: seeded.secondScopeOrgId,
        posId: seeded.globalPositionId,
        status: EmploymentStatus.Enable,
        isPrimary: true,
        description: "cross-root transfer",
      }]);
    expect(await harness.db
      .select({ status: organizationResponsibilityAssignments.status })
      .from(organizationResponsibilityAssignments)
      .where(eq(
        organizationResponsibilityAssignments.employmentId,
        seeded.inScopeEnabledId,
      )))
      .toEqual([{ status: OrganizationResponsibilityAssignmentStatus.Disable }]);
    expect(await harness.db.select({ action: auditLogs.action }).from(auditLogs))
      .toEqual(expect.arrayContaining([
        { action: "admin.organization_responsibility_assignment.end" },
        { action: "admin.employment.transfer" },
      ]));
    expect(await harness.db
      .select({ userId: userProfileDirty.userId })
      .from(userProfileDirty)
      .where(eq(userProfileDirty.userId, seeded.inScopeEnabledUserId)))
      .toEqual([{ userId: seeded.inScopeEnabledUserId }]);
  });

  test("sets and clears an in-scope Primary while keeping an out-of-scope old Primary concealed", async () => {
    const { managePrimaryEmployment } = createSubject();
    const authorization = await scopedAuthorization();

    const set = await managePrimaryEmployment.execute({
      command: "set",
      employmentId: seeded.inScopeEnabledId,
    }, { authorization });
    expect(set).toEqual({ changed: true, result: null });
    const repeatedSet = await managePrimaryEmployment.execute({
      command: "set",
      employmentId: seeded.inScopeEnabledId,
    }, { authorization });
    expect(repeatedSet).toEqual({ changed: false, result: null });
    expect(await harness.db
      .select({ id: employments.id, isPrimary: employments.isPrimary })
      .from(employments)
      .where(eq(employments.userId, seeded.inScopeEnabledUserId)))
      .toEqual(expect.arrayContaining([
        { id: seeded.inScopeEnabledId, isPrimary: true },
        { id: seeded.outOfScopeOldPrimaryId, isPrimary: false },
      ]));

    let oldPrimaryFailure: unknown;
    try {
      await managePrimaryEmployment.execute({
        command: "set",
        employmentId: seeded.outOfScopeOldPrimaryId,
      }, { authorization });
    }
    catch (error) {
      oldPrimaryFailure = error;
    }
    expect(oldPrimaryFailure).toBeInstanceOf(EmploymentNotFoundError);

    const cleared = await managePrimaryEmployment.execute({
      command: "clear",
      employmentId: seeded.inScopeEnabledId,
    }, { authorization });
    expect(cleared).toEqual({ changed: true, result: null });
    const repeatedClear = await managePrimaryEmployment.execute({
      command: "clear",
      employmentId: seeded.inScopeEnabledId,
    }, { authorization });
    expect(repeatedClear).toEqual({ changed: false, result: null });
    expect(await harness.db
      .select({ id: employments.id, isPrimary: employments.isPrimary })
      .from(employments)
      .where(eq(employments.userId, seeded.inScopeEnabledUserId)))
      .toEqual(expect.arrayContaining([
        { id: seeded.inScopeEnabledId, isPrimary: false },
        { id: seeded.outOfScopeOldPrimaryId, isPrimary: false },
      ]));
  });
});

function createSubject() {
  const repositories = createAdminApiRepositories(harness.db);
  const clock = { nowDate: () => new Date("2026-08-24T00:00:00Z") };
  const unitOfWork = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn: mock(() => undefined) },
    userProfileJobProducer: {
      enqueueRebuildJobs: mock(async () => ({ enqueued: 0, jobIds: [] })),
    } as never,
    clock,
  });
  const service = createEmploymentService({
    employmentRepository: repositories.employment,
    roleAssignmentResolver: {
      resolveEffectiveRoles: mock(async () => new Map()),
    },
    privilegeRepository: repositories.privilege,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      auditService: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
  const createEmployment = createCreateEmploymentUseCase({
    clock,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      positionReader: tx.repositories.position,
      userReader: tx.repositories.user,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
  const changeEmploymentAvailability = createChangeEmploymentAvailabilityUseCase({
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      auditLogWriter: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
  const endEmployment = createEndEmploymentUseCase({
    clock,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      auditLogWriter: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
  const transferEmployment = createTransferEmploymentUseCase({
    clock,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      positionReader: tx.repositories.position,
      userReader: tx.repositories.user,
      auditLogWriter: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
  const managePrimaryEmployment = createManagePrimaryEmploymentUseCase({
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
  return {
    changeEmploymentAvailability,
    createEmployment,
    endEmployment,
    managePrimaryEmployment,
    service,
    transferEmployment,
  };
}

function query(
  pageNum: number,
  pageSize: number,
  statuses?: EmploymentStatus[],
) {
  return {
    pageNum,
    pageSize,
    conditions: {
      fuzzyConditions: {},
      exactConditions: statuses === undefined ? {} : { statuses },
    },
  };
}

function scopedAuthorization(
  denyMutation: AdminEmploymentAuthorization["denyMutation"] = () => {
    throw new EmploymentNotFoundError();
  },
): Promise<AdminEmploymentAuthorization> {
  return createTestHrEmploymentAuthorization({
    rootOrganizationIds: [seeded.inScopeOrgId],
    organizationIds: [seeded.inScopeOrgId],
    denyMutation,
  });
}

async function seedEmploymentGraph(db: DbClient) {
  const [inScopeOrg, secondScopeOrg, outOfScopeOrg] = await db
    .insert(organizations)
    .values([
      organization("IN", "In Scope"),
      organization("IN_TWO", "Second Scope Root"),
      organization("OUT", "Out of Scope"),
    ])
    .returning({ id: organizations.id });
  const [inScopeChildOrg] = await db
    .insert(organizations)
    .values({
      ...organization("IN_CHILD", "In Scope Child"),
      parentId: inScopeOrg!.id,
      businessParentId: inScopeOrg!.id,
      path: "/IN/IN_CHILD",
      level: OrganizationLevel.Two,
    })
    .returning({ id: organizations.id });
  await db.insert(organizationClosures).values([
    { ancestorId: inScopeOrg!.id, descendantId: inScopeOrg!.id, depth: 0 },
    { ancestorId: inScopeChildOrg!.id, descendantId: inScopeChildOrg!.id, depth: 0 },
    { ancestorId: inScopeOrg!.id, descendantId: inScopeChildOrg!.id, depth: 1 },
    { ancestorId: secondScopeOrg!.id, descendantId: secondScopeOrg!.id, depth: 0 },
    { ancestorId: outOfScopeOrg!.id, descendantId: outOfScopeOrg!.id, depth: 0 },
  ]);
  const [globalPosition] = await db
    .insert(positions)
    .values({ posCode: "GLOBAL", posName: "Global Position", status: PositionStatus.Enable })
    .returning({ id: positions.id });
  const seededUsers = await db
    .insert(users)
    .values([
      user("enabled"),
      user("paused"),
      user("ended"),
      user("outside"),
      user("tombstone"),
      user("candidate", UserStatus.Pause),
      user("outside-candidate", UserStatus.Disable),
    ])
    .returning({ id: users.id, username: users.username });
  const userId = (username: string) =>
    seededUsers.find(item => item.username === username)!.id;
  const seededEmployments = await db
    .insert(employments)
    .values([
      employment(userId("enabled"), globalPosition!.id, inScopeOrg!.id, EmploymentStatus.Enable),
      employment(userId("paused"), globalPosition!.id, inScopeOrg!.id, EmploymentStatus.Pause),
      employment(userId("ended"), globalPosition!.id, inScopeOrg!.id, EmploymentStatus.Disable),
      { ...employment(userId("outside"), globalPosition!.id, outOfScopeOrg!.id, EmploymentStatus.Enable), description: "outside" },
      { ...employment(userId("tombstone"), globalPosition!.id, inScopeOrg!.id, EmploymentStatus.Enable), isDelete: true },
      {
        ...employment(
          userId("enabled"),
          globalPosition!.id,
          outOfScopeOrg!.id,
          EmploymentStatus.Enable,
        ),
        isPrimary: true,
      },
    ])
    .returning({ id: employments.id, userId: employments.userId });
  const employmentId = (username: string) =>
    seededEmployments.find(item => item.userId === userId(username))!.id;
  return {
    inScopeOrgId: inScopeOrg!.id,
    inScopeChildOrgId: inScopeChildOrg!.id,
    secondScopeOrgId: secondScopeOrg!.id,
    outOfScopeOrgId: outOfScopeOrg!.id,
    globalPositionId: globalPosition!.id,
    inScopeEnabledUserId: userId("enabled"),
    inScopePausedUserId: userId("paused"),
    outOfScopeUserId: userId("outside"),
    candidateUserId: userId("candidate"),
    outsideCandidateUserId: userId("outside-candidate"),
    inScopeEnabledId: employmentId("enabled"),
    inScopePausedId: employmentId("paused"),
    inScopeEndedId: employmentId("ended"),
    outOfScopeId: employmentId("outside"),
    tombstoneId: employmentId("tombstone"),
    outOfScopeOldPrimaryId: seededEmployments.at(-1)!.id,
  };
}

function organization(orgCode: string, orgName: string) {
  return {
    orgCode,
    orgName,
    parentId: -1,
    businessParentId: -1,
    path: `/${orgCode}`,
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
  };
}

function user(username: string, status = UserStatus.Enable) {
  return {
    username,
    name: username,
    userType: UserType.Formal,
    status,
  };
}

function employment(
  userId: number,
  posId: number,
  orgId: number,
  status: EmploymentStatus,
) {
  return {
    userId,
    posId,
    orgId,
    status,
    isPrimary: false,
    startTime: new Date("2026-01-01T00:00:00Z"),
    endTime: status === EmploymentStatus.Disable
      ? new Date("2026-02-01T00:00:00Z")
      : null,
  };
}
