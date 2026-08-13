import { createOrganizationRepository } from "@admin-api/services/organization/organization.repository";
import { createPositionRepository } from "@admin-api/services/position/position.repository";
import { createUserRepository } from "@admin-api/services/user/user.repository";
import { describe, expect, test } from "bun:test";
import { createQueryCaptureDb, renderQuery } from "../helpers/drizzle-query-capture";

describe("Open Employment parent lifecycle repository guards", () => {
  test("counts only enabled and paused non-tombstone Employments for a Position", async () => {
    const { db, topLevelWhere } = createQueryCaptureDb();
    const repository = createPositionRepository(db as any);

    await repository.countOpenEmploymentsByPosCode("DEV");

    const query = renderQuery(topLevelWhere.at(-1));
    expect(query.sql).toContain("\"employment\".\"status\" in ($2, $3)");
    expect(query.params).toEqual([false, 1, 2, "DEV", false]);
  });

  test("counts Open Employments throughout an Organization hierarchy", async () => {
    const { db, topLevelWhere } = createQueryCaptureDb();
    const repository = createOrganizationRepository(db as any);

    await repository.countOpenEmploymentsByOrgCode("ORG");

    const query = renderQuery(topLevelWhere.at(-1));
    expect(query.sql).toContain("\"employment\".\"status\" in ($2, $3)");
    expect(query.sql).toContain("\"organization_closure\".\"descendant_id\" = \"employment\".\"dept_id\"");
    expect(query.params).toEqual([false, 1, 2, "ORG", false]);
  });

  test("counts only enabled and paused non-tombstone Employments for a User", async () => {
    const { db, topLevelWhere } = createQueryCaptureDb();
    const repository = createUserRepository(db as any);

    await repository.countOpenEmploymentsByUsername("zhangsan");

    const query = renderQuery(topLevelWhere.at(-1));
    expect(query.sql).toContain("\"employment\".\"status\" in ($2, $3)");
    expect(query.params).toEqual([false, 1, 2, "zhangsan", false]);
  });
});
