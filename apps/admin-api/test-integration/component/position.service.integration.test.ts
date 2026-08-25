import { createPositionRepository } from "@admin-api/services/position/position.repository";
import { createPositionService } from "@admin-api/services/position/position.service";
import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { EmploymentStatus, PositionStatus } from "@iam/contracts";
import { PositionHasEmploymentError } from "@iam/domain/position";
import { describe, expect, mock, test } from "bun:test";
import { createOpenEmploymentFixtureDb } from "../helpers/drizzle-query-capture";

function position(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    posCode: "DEV",
    posName: "Developer",
    status: PositionStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date("2026-01-01T00:00:00Z"),
    updateTime: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function createService(overrides: Record<string, unknown> = {}) {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    userProfileInvalidation: {
      recordChanges: mock(async () => undefined),
    },
    positionRepository: {
      countOpenEmploymentsByPosCode: mock(async (_posCode: string) => 0),
      getAnyPositionByCode: mock(async () => null),
      getPositionByCode: mock(async () => position()),
      setPosition: mock(async () => position()),
      softDeletePositionByCode: mock(async () => position({ isDelete: true })),
      updatePositionByCode: mock(async () => position()),
    },
  };
  const deps = {
    positionRepository: {
      getPositionDetailByCode: mock(async () => position({ memberNumber: 0 })),
      getPositionByCode: mock(async () => position()),
    },
    uow: createImmediateUnitOfWork(tx),
    ...overrides,
  } as any;
  return { service: createPositionService(deps), tx, deps };
}

function useEmploymentFixture(
  tx: ReturnType<typeof createService>["tx"],
  fixture: { status: EmploymentStatus; isDelete: boolean },
) {
  const repository = createPositionRepository(createOpenEmploymentFixtureDb([{
    ...fixture,
    posCode: "DEV",
  }]) as any);
  tx.positionRepository.countOpenEmploymentsByPosCode = mock(repository.countOpenEmploymentsByPosCode);
}

describe("createPositionService", () => {
  test("updates a position inside a unit of work and records audit", async () => {
    const { service, tx } = createService();

    await expect(service.updatePosition("DEV", { posName: "Senior Developer" })).resolves.toBe(true);

    expect(tx.positionRepository.updatePositionByCode).toHaveBeenCalledWith("DEV", { posName: "Senior Developer" });
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.position.update",
      targetCode: "DEV",
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "position", positionId: 1 },
    ]);
  });

  test("rejects renaming to an existing position code", async () => {
    const { service, tx } = createService();
    (tx.positionRepository.getAnyPositionByCode as any).mockResolvedValue(position({ id: 2, posCode: "OPS" }));

    await expect(service.updatePosition("DEV", { posCode: "OPS" })).rejects.toThrow("岗位编码已存在");

    expect(tx.positionRepository.updatePositionByCode).not.toHaveBeenCalled();
  });

  test.each([
    ["Enable", EmploymentStatus.Enable],
    ["Pause", EmploymentStatus.Pause],
  ])("rejects deleting a position with an Open Employment in %s state", async (_label, employmentStatus) => {
    const { service, tx } = createService();
    useEmploymentFixture(tx, { status: employmentStatus, isDelete: false });

    await expect(service.deletePosition("DEV")).rejects.toThrow();

    expect(tx.positionRepository.softDeletePositionByCode).not.toHaveBeenCalled();
  });

  test.each([
    ["Enable", EmploymentStatus.Enable, PositionStatus.Pause],
    ["Pause", EmploymentStatus.Pause, PositionStatus.Disable],
  ])(
    "rejects a status transition when the position has an Open Employment in %s state",
    async (_employmentState, employmentStatus, status) => {
      const { service, tx } = createService();
      useEmploymentFixture(tx, { status: employmentStatus, isDelete: false });

      await expect(service.updatePositionStatus("DEV", status))
        .rejects
        .toBeInstanceOf(PositionHasEmploymentError);

      expect(tx.positionRepository.updatePositionByCode).not.toHaveBeenCalled();
    },
  );

  test("re-enables a position without inspecting or changing its Employments", async () => {
    const { service, tx } = createService();
    tx.positionRepository.getPositionByCode.mockResolvedValue(position({ status: PositionStatus.Disable }));
    tx.positionRepository.countOpenEmploymentsByPosCode.mockResolvedValue(1);

    await expect(service.updatePositionStatus("DEV", PositionStatus.Enable)).resolves.toBe(true);

    expect(tx.positionRepository.countOpenEmploymentsByPosCode).not.toHaveBeenCalled();
    expect(tx.positionRepository.updatePositionByCode).toHaveBeenCalledWith("DEV", {
      status: PositionStatus.Enable,
    });
  });

  test.each([
    ["Ended Employment", EmploymentStatus.Disable, false],
    ["Legacy Employment Tombstone", EmploymentStatus.Enable, true],
  ])("allows a position status change when referenced only by %s history", async (_label, status, isDelete) => {
    const { service, tx } = createService();
    useEmploymentFixture(tx, { status, isDelete });

    await expect(service.updatePositionStatus("DEV", PositionStatus.Disable)).resolves.toBe(true);

    expect(tx.positionRepository.updatePositionByCode).toHaveBeenCalledWith("DEV", {
      status: PositionStatus.Disable,
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "position", positionId: 1 },
    ]);
  });

  test.each([
    ["Ended Employment", EmploymentStatus.Disable, false],
    ["Legacy Employment Tombstone", EmploymentStatus.Enable, true],
  ])("allows deleting a position referenced only by %s history", async (_label, status, isDelete) => {
    const { service, tx } = createService();
    useEmploymentFixture(tx, { status, isDelete });

    await expect(service.deletePosition("DEV")).resolves.toBe(true);

    expect(tx.positionRepository.countOpenEmploymentsByPosCode).toHaveBeenCalledWith("DEV");
    expect(tx.positionRepository.softDeletePositionByCode).toHaveBeenCalledWith("DEV");
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "position", positionId: 1 },
    ]);
  });
});
