import { EmploymentStatus } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { employments } from "../employments";

function indexesByName() {
  const indexes = getTableConfig(employments).indexes.map((index: any) => [index.config.name, index.config]);
  return Object.fromEntries(indexes) as Record<string, any>;
}

describe("employment schema", () => {
  test("enforces active relationship uniqueness with a partial unique index", () => {
    const indexes = indexesByName();
    const index = indexes.employment_active_relationship_unique_idx;
    const whereChunks = index.where.queryChunks as unknown[];

    expect(index).toMatchObject({
      unique: true,
      method: "btree",
    });
    expect(index.columns.map((column: any) => column.name)).toEqual(["user_id", "dept_id", "pos_id"]);
    expect(whereChunks.filter((chunk: any) => typeof chunk === "object" && "name" in chunk).map((chunk: any) => chunk.name))
      .toEqual(["is_delete", "status"]);
    expect(whereChunks.some((chunk: any) =>
      typeof chunk === "object" && "value" in chunk && chunk.value.join("").includes("= false"),
    )).toBe(true);
    expect(whereChunks).toContain(EmploymentStatus.Enable);
  });
});
