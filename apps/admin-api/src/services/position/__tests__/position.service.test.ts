import { beforeEach, describe, expect, mock, test } from "bun:test";

const transaction = mock(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));

mock.module("@iam/db", () => ({
  default: {
    transaction,
  },
}));

const positionRepository = {
  getAnyPositionByCode: mock(),
  getPositionByCode: mock(),
  updatePositionByCode: mock(),
};

const auditService = {
  recordAuditLog: mock(),
  resolveAdminAuditContext: mock((context?: unknown) => context ?? { actorType: "system", actorSystemKey: "admin-api" }),
};

mock.module("@admin-api/services/audit/audit.service", () => auditService);
mock.module("../position.repository", () => positionRepository);

const positionService = await import("../position.service");

describe("positionService.updatePosition", () => {
  beforeEach(() => {
    transaction.mockClear();
    positionRepository.getAnyPositionByCode.mockReset();
    positionRepository.getPositionByCode.mockReset();
    positionRepository.updatePositionByCode.mockReset();
    auditService.recordAuditLog.mockReset();
    auditService.resolveAdminAuditContext.mockClear();
  });

  test("rejects renaming a position code to one that already exists", async () => {
    positionRepository.getPositionByCode.mockResolvedValue({ posCode: "OLD" });
    positionRepository.getAnyPositionByCode.mockResolvedValue({ posCode: "NEW" });

    await expect(positionService.updatePosition("OLD", { posCode: "NEW" })).rejects.toThrow(
      "重命名岗位编码失败",
    );

    expect(positionRepository.getAnyPositionByCode).toHaveBeenCalledWith("NEW", {});
    expect(positionRepository.updatePositionByCode).not.toHaveBeenCalled();
  });
});
