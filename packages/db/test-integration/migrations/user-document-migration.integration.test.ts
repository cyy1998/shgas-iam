import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const migrations = new URL("../../src/migrations/", import.meta.url);
const target = "20261026085339_user_document_updates";
let harness: PostgresTestHarness;
let baselineDirectory: string;
beforeEach(async () => {
  harness = await createPostgresTestHarness();
  baselineDirectory = await mkdtemp(join(tmpdir(), "iam-user-document-migration-"));
});
afterEach(async () => {
  await harness?.close();
  if (baselineDirectory) await rm(baselineDirectory, { recursive: true });
});

test("formal upgrade preserves old versions and sources and gives every published profile durable post-publication recovery", async () => {
  const previous = (await readdir(migrations, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && entry.name < target,
  );
  for (const entry of previous)
    await cp(new URL(entry.name, migrations), join(baselineDirectory, entry.name), { recursive: true });
  const db = drizzle({ client: harness.sql });
  await migrate(db, { migrationsFolder: baselineDirectory, migrationsSchema: harness.schemaName });
  await harness.sql`INSERT INTO "user" (id,subject_identifier,username,name)
    VALUES (1,'10000000-0000-4000-8000-000000000001','processed','Processed'),
      (2,'10000000-0000-4000-8000-000000000002','processing','Processing'),
      (3,'10000000-0000-4000-8000-000000000003','pending','Pending')`;
  await harness.sql`INSERT INTO user_profile_dirty (user_id,dirty_version,status,processed_at)
    VALUES (1,7,'processed','2026-10-25')`;
  await harness.sql`INSERT INTO user_profile_dirty (user_id,dirty_version,status,processing_started_at)
    VALUES (2,8,'processing','2026-10-25'),(3,9,'pending',NULL)`;
  await harness.sql`INSERT INTO user_profile
    (user_id,subject_identifier,username,name,status,profile_schema_version,source_dirty_version,detail,search_doc,subject_facts)
    SELECT id,subject_identifier,username,name,status,1,CASE id WHEN 1 THEN 7 ELSE 6 END,'{}','{}','{}'
    FROM "user" WHERE id IN (1,2)`;
  const sourcesBefore = await harness.sql`SELECT * FROM "user" ORDER BY id`;
  const profilesBefore = await harness.sql`SELECT * FROM user_profile ORDER BY user_id`;
  const journalBefore = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  await cp(new URL(target, migrations), join(baselineDirectory, target), { recursive: true });
  const options = { migrationsFolder: baselineDirectory, migrationsSchema: harness.schemaName };
  await migrate(db, options);
  const states = await harness.sql`SELECT user_id,version,status,processing_token,
    post_publication_version,post_publication_status FROM user_document_rebuild_state ORDER BY user_id`;
  const sourcesAfter = await harness.sql`SELECT * FROM "user" ORDER BY id`;
  const profilesAfter = await harness.sql`SELECT * FROM user_profile ORDER BY user_id`;
  const outbox = await harness.sql`SELECT * FROM user_document_outbox`;
  const journalAfter = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  await migrate(db, options);
  const statesRepeated = await harness.sql`SELECT user_id,version,status,processing_token,
    post_publication_version,post_publication_status FROM user_document_rebuild_state ORDER BY user_id`;
  const journalRepeated = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect([...sourcesAfter]).toEqual([...sourcesBefore]);
  expect([...profilesAfter]).toEqual([...profilesBefore]);
  expect([...outbox]).toEqual([]);
  expect(states[0]).toEqual({
    user_id: 1,
    version: "7",
    status: "processed",
    processing_token: null,
    post_publication_version: "7",
    post_publication_status: "pending",
  });
  expect(states[1]).toMatchObject({
    user_id: 2,
    version: "8",
    status: "processing",
    processing_token: expect.any(String),
    post_publication_version: "6",
    post_publication_status: "pending",
  });
  expect(states[2]).toEqual({
    user_id: 3,
    version: "9",
    status: "pending",
    processing_token: null,
    post_publication_version: null,
    post_publication_status: null,
  });
  expect([...statesRepeated]).toEqual([...states]);
  expect(journalAfter.length).toBe(journalBefore.length + 1);
  expect([...journalAfter].slice(0, journalBefore.length)).toEqual([...journalBefore]);
  expect([...journalRepeated]).toEqual([...journalAfter]);
});
