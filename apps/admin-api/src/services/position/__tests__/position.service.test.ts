import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { PositionStatus, UserProfileDirtyReason, UserProfileScopeType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createPositionService } from "../position.service";

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
    profileDirtyMarker: {
      markScopeDirty: mock(async () => ({ marked: 1, userIds: [1] })),
    },
    positionRepository: {
      countActiveEmploymentsByPosCode: mock(async () => 0),
      getAnyPositionByCode: mock(async () => null),
      getPositionByCode: mock(async () => position()),
      setPosition: mock(async () => position()),
      softDeletePositionByCode: mock(async () => position({ isDelete: true })),
      updatePositionByCode: mock(async () => position()),
    },
  };
  const deps = {
    positionRepository: {
      getPositionByCode: mock(async () => position()),
    },
    uow: createImmediateUnitOfWork(tx),
    ...overrides,
  } as any;
  return { service: createPositionService(deps), tx, deps };
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
    expect(tx.profileDirtyMarker.markScopeDirty).toHaveBeenCalledWith({
      scope: { scopeType: UserProfileScopeType.PositionId, scopeId: 1 },
      reasonCodes: [UserProfileDirtyReason.PositionUpdated],
      afterCommit: expect.any(Object),
      requestId: undefined,
      traceId: undefined,
    });
  });

  test("rejects renaming to an existing position code", async () => {
    const { service, tx } = createService();
    (tx.positionRepository.getAnyPositionByCode as any).mockResolvedValue(position({ id: 2, posCode: "OPS" }));

    await expect(service.updatePosition("DEV", { posCode: "OPS" })).rejects.toThrow("岗位编码已存在");

    expect(tx.positionRepository.updatePositionByCode).not.toHaveBeenCalled();
  });

  test("rejects deleting a position with active employments", async () => {
    const { service, tx } = createService();
    tx.positionRepository.countActiveEmploymentsByPosCode.mockResolvedValue(1);

    await expect(service.deletePosition("DEV")).rejects.toThrow();

    expect(tx.positionRepository.softDeletePositionByCode).not.toHaveBeenCalled();
  });
});
