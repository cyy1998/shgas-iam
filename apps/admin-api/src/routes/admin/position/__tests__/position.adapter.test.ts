import type { AdminApiRestContext } from "@admin-api/lib/admin-api-adapter";
import type { Context } from "hono";
import { createPositionService } from "@admin-api/services/position/position.service";
import { EmploymentStatus, PositionStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createPositionAdapter } from "../position.adapter";

const now = new Date("2026-01-01T00:00:00Z");

function employment(id: number) {
  return {
    id,
    userId: id,
    posId: 2,
    orgId: 10,
    isPrimary: false,
    status: EmploymentStatus.Enable,
    startTime: now,
    endTime: null,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
  };
}

function createRestContext(query: Record<string, unknown>) {
  return {
    req: {
      valid: mock(() => query),
    },
    json: mock((body: unknown) => body),
  } as unknown as AdminApiRestContext & {
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

describe("admin position adapter", () => {
  test("returns the same paginated position VO through REST and tRPC search", async () => {
    const query = {
      conditions: {
        fuzzyConditions: { text: "engineer" },
        exactConditions: { statuses: [PositionStatus.Enable, PositionStatus.Pause] },
      },
      pageNum: 2,
      pageSize: 1,
    };
    const searchPositionsFuzzy = mock(async () => [
      {
        id: 1,
        posCode: "DEV",
        posName: "Developer",
        status: PositionStatus.Enable,
        description: null,
        isDelete: false,
        createTime: now,
        updateTime: now,
        employments: [],
      },
      {
        id: 2,
        posCode: "SRE",
        posName: "Site Reliability Engineer",
        status: PositionStatus.Pause,
        description: "Platform operations",
        isDelete: false,
        createTime: now,
        updateTime: now,
        employments: [employment(11), employment(12)],
      },
    ]);
    const positionService = createPositionService({
      positionRepository: {
        getPositionByCode: mock(async () => null),
        searchPositionsFuzzy,
      },
      uow: { transaction: mock() },
    } as any);
    const adapter = createPositionAdapter({ positionService } as any);
    const expected = {
      result: [{
        id: 2,
        posCode: "SRE",
        posName: "Site Reliability Engineer",
        status: PositionStatus.Pause,
        statusText: "暂停",
        memberNumber: 2,
        description: "Platform operations",
        isDelete: false,
        createTime: now,
        updateTime: now,
      }],
      total: 2,
      pageNum: 2,
      pageSize: 1,
      pages: 2,
    };

    const restContext = createRestContext(query);
    const handlerContext = restContext as unknown as Parameters<typeof adapter.positionsSearch>[0];
    await expect(adapter.positionsSearch(handlerContext, async () => {})).resolves.toMatchObject({ code: 200 });
    expect(restContext.json).toHaveBeenCalledWith({
      code: 200,
      data: expected,
      message: "success",
    }, 200);

    const caller = adapter.positionAdminRouter.createCaller({ hono: {} as Context });
    await expect(caller.search(query)).resolves.toEqual(expected);
    expect(searchPositionsFuzzy).toHaveBeenNthCalledWith(1, query);
    expect(searchPositionsFuzzy).toHaveBeenNthCalledWith(2, query);
  });
});
