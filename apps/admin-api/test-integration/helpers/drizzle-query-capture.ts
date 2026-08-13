import type { EmploymentStatus } from "@iam/contracts";
import { mock } from "bun:test";
import { sql } from "drizzle-orm";

const postgresDialect = {
  escapeName: (name: string) => `"${name}"`,
  escapeParam: (index: number) => `$${index + 1}`,
  escapeString: (value: string) => `'${value.replaceAll("'", "''")}'`,
  prepareTyping: () => "none",
};

type QueryCaptureOptions = {
  countValue?: number;
  resolveCount?: (condition: unknown) => number;
};

type EmploymentFixture = {
  status: EmploymentStatus;
  isDelete: boolean;
  posCode?: string;
  username?: string;
  ancestorOrgCodes?: readonly string[];
};

export function createQueryCaptureDb(options: QueryCaptureOptions = {}) {
  const topLevelWhere: unknown[] = [];

  function createSelectBuilder(selection?: Record<string, unknown>) {
    const state: { table?: unknown; where?: unknown } = {};
    const builder = {
      from(table: unknown) {
        state.table = table;
        return builder;
      },
      innerJoin() {
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
        return Promise.resolve(selection?.value === undefined
          ? []
          : [{ value: options.resolveCount?.(state.where) ?? options.countValue ?? 0 }]).then(resolve);
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

export function createOpenEmploymentFixtureDb(records: readonly EmploymentFixture[]) {
  return createQueryCaptureDb({
    resolveCount(condition) {
      const query = renderQuery(condition);
      const targetCode = query.params.find(value => typeof value === "string");
      const employmentIsDelete = query.params.find(value => typeof value === "boolean");
      const employmentStatuses = query.params.filter(
        (value): value is number => typeof value === "number",
      );

      return records.filter((record) => {
        if (
          query.sql.includes("\"employment\".\"is_delete\" =")
          && record.isDelete !== employmentIsDelete
        ) {
          return false;
        }
        if (
          query.sql.includes("\"employment\".\"status\" in")
          && !employmentStatuses.includes(record.status)
        ) {
          return false;
        }
        if (query.sql.includes("\"position\".\"post_code\" =") && record.posCode !== targetCode)
          return false;
        if (query.sql.includes("\"user\".\"username\" =") && record.username !== targetCode)
          return false;
        if (
          query.sql.includes("\"employment_org_count_ancestor\".\"org_code\" =")
          && !record.ancestorOrgCodes?.includes(String(targetCode))
        ) {
          return false;
        }
        return true;
      }).length;
    },
  }).db;
}

export function renderQuery(value: unknown) {
  return (value as {
    toQuery: (dialect: typeof postgresDialect) => { sql: string; params: unknown[] };
  }).toQuery(postgresDialect);
}

export function renderSql(value: unknown) {
  return renderQuery(value).sql;
}
