import type { AnyColumn, SQLWrapper } from "drizzle-orm";
import { ilike, inArray, sql } from "drizzle-orm";

export function firstRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export function inArrayIf(column: AnyColumn, values: readonly unknown[] | undefined): SQLWrapper | undefined {
  if (values === undefined) {
    return undefined;
  }
  if (values.length === 0) {
    return sql`false`;
  }
  return inArray(column, values);
}

export function ilikeContainsIf(column: AnyColumn, value: string | undefined): SQLWrapper | undefined {
  return value === undefined ? undefined : ilike(column, `%${value}%`);
}

export function compactUpdate<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as Partial<T>;
}
