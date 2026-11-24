import { expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "../support/postgres-test-harness";

test("the Worker fixture resets tables outside the Client dependency graph in its own public schema", async () => {
  const pg = await createWorkerPostgresTestHarness();
  try {
    const [schema] = await pg.sql`SELECT current_schema() AS name`;
    expect(schema?.name).toBe("public");
    await pg.sql`CREATE TABLE worker_fixture_probe (id integer)`;
    await pg.sql`INSERT INTO worker_fixture_probe VALUES (1)`;
    await pg.reset();
    const rows = await pg.sql`SELECT id FROM worker_fixture_probe`;
    expect(rows).toHaveLength(0);
  } finally {
    await pg.close();
  }
});
