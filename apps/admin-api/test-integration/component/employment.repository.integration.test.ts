import { createEmploymentRepository } from "@admin-api/services/employment/employment.repository";
import { EmploymentStatus } from "@iam/contracts";
import { EmploymentAlreadyExistsError } from "@iam/domain/employment";
import { describe, expect, mock, test } from "bun:test";
import { createQueryCaptureDb, renderQuery, renderSql } from "../helpers/drizzle-query-capture";

function uniqueViolation() {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint: "employment_active_relationship_unique_idx",
  });
}

describe("createEmploymentRepository", () => {
  test("loads lifecycle parents without hiding disabled or soft-deleted records", async () => {
    const employment = { id: 4, orgId: 2, posId: 3 } as any;
    const organization = { id: 2, status: 3, isDelete: true } as any;
    const position = { id: 3, status: 3, isDelete: true } as any;
    const repository = createEmploymentRepository({
      query: {
        employments: { findFirst: mock(async () => employment) },
        organizations: { findFirst: mock(async () => organization) },
        positions: { findFirst: mock(async () => position) },
      },
    } as any);

    await expect(repository.getEmploymentLifecycleContextById(4)).resolves.toEqual({
      employment,
      organization,
      position,
    });
  });

  test("finds duplicate open employments across enabled and paused states", async () => {
    const findFirst = mock(async () => undefined);
    const repository = createEmploymentRepository({
      query: { employments: { findFirst } },
    } as any);

    await expect(repository.getOpenEmploymentByUserOrgPosId(1, 2, 3)).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        userId: 1,
        orgId: 2,
        posId: 3,
        status: { in: [EmploymentStatus.Enable, EmploymentStatus.Pause] },
        isDelete: false,
      },
    });
  });

  test("excludes the resumed employment itself from the Open duplicate lookup", async () => {
    const findFirst = mock(async () => undefined);
    const repository = createEmploymentRepository({
      query: { employments: { findFirst } },
    } as any);

    await repository.getOpenEmploymentByUserOrgPosId(1, 2, 3, 4);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        userId: 1,
        orgId: 2,
        posId: 3,
        id: { ne: 4 },
        status: { in: [EmploymentStatus.Enable, EmploymentStatus.Pause] },
        isDelete: false,
      },
    });
  });

  test("selects only Open Primary Employment IDs for the command's locked selection", async () => {
    const where = mock(async (_condition: unknown) => [{ id: 7 }, { id: 3 }]);
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const repository = createEmploymentRepository({ select } as any);

    const ids = await repository.getOpenPrimaryEmploymentIdsByUserId(1);

    expect(ids).toEqual([7, 3]);
    const query = renderQuery(where.mock.calls[0]?.[0]);
    expect(query.sql).toContain("\"employment\".\"user_id\" = $1");
    expect(query.sql).toContain("\"employment\".\"is_primary\" = $2");
    expect(query.sql).toContain("\"employment\".\"is_delete\" = $3");
    expect(query.sql).toContain("\"employment\".\"status\" in ($4, $5)");
    expect(query.params).toEqual([1, true, false, EmploymentStatus.Enable, EmploymentStatus.Pause]);
  });

  test("selects only Open Employment IDs without writing their lifecycle facts", async () => {
    const where = mock(async (_condition: unknown) => [{ id: 7 }, { id: 3 }]);
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const repository = createEmploymentRepository({ select } as any);
    const ids = await repository.getOpenEmploymentIdsByUserId(1);
    expect(ids).toEqual([7, 3]);
    const query = renderQuery(where.mock.calls[0]?.[0]);
    expect(query.sql).toContain("\"employment\".\"user_id\" = $1");
    expect(query.sql).toContain("\"employment\".\"is_delete\" = $2");
    expect(query.sql).toContain("\"employment\".\"status\" in ($3, $4)");
    expect(query.params).toEqual([1, false, EmploymentStatus.Enable, EmploymentStatus.Pause]);
  });

  test("maps active relationship unique violations to employment already exists", async () => {
    const returning = mock(async () => {
      throw uniqueViolation();
    });
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const repository = createEmploymentRepository({ insert } as any);

    await expect(repository.createEmploymentRecord({
      userId: 1,
      orgId: 2,
      posId: 3,
      isPrimary: false,
      startTime: new Date("2026-01-01T00:00:00.000Z"),
      endTime: null,
      description: null,
      status: EmploymentStatus.Enable,
    })).rejects.toBeInstanceOf(EmploymentAlreadyExistsError);
  });

  test("searches fuzzy text across employment id, user, organization, and position fields", async () => {
    const { db, topLevelWhere } = createQueryCaptureDb();
    const repository = createEmploymentRepository(db as any);

    await repository.searchEmploymentsFuzzyForAdminPaged({
      pageNum: 1,
      pageSize: 20,
      conditions: {
        fuzzyConditions: { text: "FIN-001" },
        exactConditions: {},
      },
    });

    const whereSql = renderSql(topLevelWhere.at(-1));
    expect(whereSql).toContain("\"employment\".\"id\"::text ILIKE");
    expect(whereSql).toContain("\"user\".\"username\" ilike");
    expect(whereSql).toContain("\"user\".\"name\" ilike");
    expect(whereSql).toContain("\"organization\".\"org_code\" ilike");
    expect(whereSql).toContain("\"organization\".\"org_name\" ilike");
    expect(whereSql).toContain("\"position\".\"post_code\" ilike");
    expect(whereSql).toContain("\"position\".\"post_name\" ilike");
    expect(whereSql).toContain("\"employment\".\"is_delete\" = $1");
  });
});
