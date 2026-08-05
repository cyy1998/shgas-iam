import { createEmploymentRepository } from "@admin-api/services/employment/employment.repository";
import { EmploymentStatus } from "@iam/contracts";
import { EmploymentAlreadyExistsError } from "@iam/domain/employment";
import { describe, expect, mock, test } from "bun:test";
import { sql } from "drizzle-orm";

const postgresDialect = {
  escapeName: (name: string) => `"${name}"`,
  escapeParam: (index: number) => `$${index + 1}`,
  escapeString: (value: string) => `'${value.replaceAll("'", "''")}'`,
  prepareTyping: () => "none",
};

function uniqueViolation() {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint: "employment_active_relationship_unique_idx",
  });
}

function createQueryCaptureDb() {
  const topLevelWhere: unknown[] = [];

  function createSelectBuilder(selection?: Record<string, unknown>) {
    const state: { table?: unknown; where?: unknown } = {};
    const builder = {
      from(table: unknown) {
        state.table = table;
        return builder;
      },
      where(condition: unknown) {
        state.where = condition;
        topLevelWhere.push(condition);
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit() {
        return builder;
      },
      offset() {
        return builder;
      },
      getSQL() {
        return sql`select 1 from ${state.table} where ${state.where}`;
      },
      then(resolve: (value: unknown[]) => void) {
        return Promise.resolve(selection?.value === undefined ? [] : [{ value: 0 }]).then(resolve);
      },
    };
    return builder;
  }

  return {
    db: {
      select: mock((selection?: Record<string, unknown>) => createSelectBuilder(selection)),
    },
    topLevelWhere,
  };
}

function renderSql(value: unknown) {
  return (value as { toQuery: (dialect: typeof postgresDialect) => { sql: string } }).toQuery(postgresDialect).sql;
}

describe("createEmploymentRepository", () => {
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
