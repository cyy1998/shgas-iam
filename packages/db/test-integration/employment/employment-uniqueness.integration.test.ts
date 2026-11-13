import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { EmploymentStatus } from "@iam/contracts";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api-postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { employments } from "../../src/schema/core/employments";
import type { PostgresTestHarness } from "../support/postgres-harness";
import { createPostgresTestHarness, expectPostgresErrorCode } from "../support/postgres-harness";

for (const source of ["schema definition", "formal migrations"] as const) {
  describe(`Employment uniqueness from ${source}`, () => {
    let harness: PostgresTestHarness;

    beforeAll(async () => {
      harness = await createPostgresTestHarness();
      if (source === "formal migrations") {
        await migrate(drizzle({ client: harness.sql }), {
          migrationsFolder: fileURLToPath(new URL("../../src/migrations", import.meta.url)),
          migrationsSchema: harness.schemaName,
        });
      } else {
        const emptySchema = await generateDrizzleJson({});
        const employmentSchema = await generateDrizzleJson({ employments });
        const statements = await generateMigration(emptySchema, employmentSchema);
        for (const statement of statements) await harness.sql.unsafe(statement);
      }
    });
    beforeEach(async () => {
      await harness.sql`TRUNCATE employment RESTART IDENTITY`;
    });
    afterAll(async () => {
      await harness?.close();
    });

    async function insertEmployment(
      overrides: Partial<{
        userId: number;
        orgId: number;
        posId: number;
        status: EmploymentStatus;
        isDelete: boolean;
      }> = {},
    ) {
      const row = { userId: 10, orgId: 20, posId: 30, status: EmploymentStatus.Enable, isDelete: false, ...overrides };
      return await harness.sql<{ id: number }[]>`
        INSERT INTO employment (user_id, dept_id, pos_id, status, is_delete)
        VALUES (${row.userId}, ${row.orgId}, ${row.posId}, ${row.status}, ${row.isDelete})
        RETURNING id
      `;
    }

    for (const existingStatus of [EmploymentStatus.Enable, EmploymentStatus.Pause, EmploymentStatus.Pending]) {
      test.each([EmploymentStatus.Enable, EmploymentStatus.Pause, EmploymentStatus.Pending])(
        `rejects state %i as a duplicate of open state ${existingStatus}`,
        async (status) => {
          await insertEmployment({ status: existingStatus });
          await expectPostgresErrorCode(insertEmployment({ status }), "23505");
          const rows = await harness.sql`SELECT id FROM employment`;
          expect(rows).toHaveLength(1);
        },
      );
    }

    test.each(["userId", "orgId", "posId"] as const)("allows a different %s in the relationship", async (field) => {
      await insertEmployment();
      await insertEmployment({ [field]: 99 });
      const rows = await harness.sql`SELECT id FROM employment`;
      expect(rows).toHaveLength(2);
    });

    test.each([
      { name: "ended", status: EmploymentStatus.Disable, isDelete: false },
      { name: "soft-deleted Pending", status: EmploymentStatus.Pending, isDelete: true },
    ])("allows repeated $name records alongside a live enabled employment", async ({ status, isDelete }) => {
      await insertEmployment();
      await insertEmployment({ status, isDelete });
      await insertEmployment({ status, isDelete });
      const rows = await harness.sql`SELECT id FROM employment`;
      expect(rows).toHaveLength(3);
    });
  });
}
