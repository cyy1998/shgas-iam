import { RoleAssignmentTargetType } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  insertRoleAssignmentSchema,
  roleAssignments,
} from "../role-assignments";

function columnsByName() {
  const columns = getTableConfig(roleAssignments).columns.map((column: any) => [column.name, column]);
  return Object.fromEntries(columns) as Record<string, any>;
}

function indexesByName() {
  const indexes = getTableConfig(roleAssignments).indexes.map((index: any) => [index.config.name, index.config]);
  return Object.fromEntries(indexes) as Record<string, any>;
}

function compactSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

describe("role assignment schema", () => {
  test("stores polymorphic assignment targets with an explicit unique assignment constraint", () => {
    const columns = columnsByName();
    const indexes = indexesByName();

    expect(columns.id.columnType).toBe("PgSerial");
    expect(columns.role_id.notNull).toBe(true);
    expect(columns.target_type.notNull).toBe(true);
    expect(columns.target_id.notNull).toBe(true);
    expect(columns.include_descendants.notNull).toBe(true);
    expect(columns.include_descendants.hasDefault).toBe(true);
    expect(indexes.role_assignment_role_id_target_type_target_id_key).toMatchObject({
      unique: true,
      method: "btree",
    });
    expect(indexes.role_assignment_role_id_target_type_target_id_key.columns.map((column: any) => column.name))
      .toEqual(["role_id", "target_type", "target_id"]);
  });

  test("validates only supported assignment target types", () => {
    expect(insertRoleAssignmentSchema.parse({
      roleId: 1,
      targetType: RoleAssignmentTargetType.Organization,
      targetId: 10,
      includeDescendants: true,
    })).toMatchObject({
      roleId: 1,
      targetType: RoleAssignmentTargetType.Organization,
      targetId: 10,
      includeDescendants: true,
    });

    expect(() => insertRoleAssignmentSchema.parse({
      roleId: 1,
      targetType: "user",
      targetId: 10,
      includeDescendants: false,
    })).toThrow();
  });
});

describe("role assignment migration", () => {
  test("backfills all legacy assignment sources before dropping legacy tables", async () => {
    const sql = compactSql(await Bun.file(
      `${import.meta.dir}/../../../migrations/20260702090217_black_praxagora/migration.sql`,
    ).text());

    const employmentBackfill
      = `INSERT INTO "role_assignment" ("role_id", "target_type", "target_id", "include_descendants") `
        + `SELECT "role_id", 'employment', "employment_id", false FROM "employment_role";`;
    const organizationBackfill
      = `INSERT INTO "role_assignment" ("role_id", "target_type", "target_id", "include_descendants") `
        + `SELECT "role_id", 'organization', "organization_id", "is_all_sub" FROM "organization_role";`;
    const positionBackfill
      = `INSERT INTO "role_assignment" ("role_id", "target_type", "target_id", "include_descendants") `
        + `SELECT "role_id", 'position', "position_id", false FROM "position_role";`;

    expect(sql.match(/INSERT INTO "role_assignment"/gu)?.length).toBe(3);
    expect(sql).toContain(employmentBackfill);
    expect(sql).toContain(organizationBackfill);
    expect(sql).toContain(positionBackfill);
    expect(sql.indexOf(employmentBackfill)).toBeLessThan(sql.indexOf(`DROP TABLE "employment_role";`));
    expect(sql.indexOf(organizationBackfill)).toBeLessThan(sql.indexOf(`DROP TABLE "organization_role";`));
    expect(sql.indexOf(positionBackfill)).toBeLessThan(sql.indexOf(`DROP TABLE "position_role";`));
  });
});
