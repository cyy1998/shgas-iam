import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const migrations = new URL("../../src/migrations/", import.meta.url);
const target = "20261026100403_user_document_storage";
let harness: PostgresTestHarness;
let directory: string;
beforeEach(async () => {
  harness = await createPostgresTestHarness();
  directory = await mkdtemp(join(tmpdir(), "iam-document-storage-"));
});
afterEach(async () => {
  await harness?.close();
  if (directory) await rm(directory, { recursive: true });
});

test("storage upgrade preserves sources, outstanding work and migration receipts while retiring all old derived blobs", async () => {
  const previous = (await readdir(migrations, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && entry.name < target,
  );
  for (const entry of previous)
    await cp(new URL(entry.name, migrations), join(directory, entry.name), { recursive: true });
  const db = drizzle({ client: harness.sql });
  const options = { migrationsFolder: directory, migrationsSchema: harness.schemaName };
  await migrate(db, options);
  await harness.sql`INSERT INTO "user"(id,subject_identifier,username,name,password) VALUES(1,'10000000-0000-4000-8000-000000000001','unchanged','Unchanged','unchanged-password')`;
  await harness.sql`INSERT INTO user_profile(user_id,subject_identifier,username,name,status,profile_schema_version,source_dirty_version,detail,search_doc,subject_facts) SELECT id,subject_identifier,username,name,status,4,7,'{}','{}','{}' FROM "user"`;
  await harness.sql`INSERT INTO user_document_rebuild_state(user_id,version,status,post_publication_version,post_publication_status) VALUES(1,8,'pending',7,'failed')`;
  await harness.sql`INSERT INTO user_document_outbox(id,source,status,last_error) VALUES('10000000-0000-4000-8000-000000000002','{"change":{"kind":"user","userId":1}}','failed','PendingRecovery')`;
  const sources = await harness.sql`SELECT * FROM "user"`;
  const states = await harness.sql`SELECT * FROM user_document_rebuild_state`;
  const outbox = await harness.sql`SELECT * FROM user_document_outbox`;
  const journal = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  await cp(new URL(target, migrations), join(directory, target), { recursive: true });
  await migrate(db, options);
  const sourcesAfter = await harness.sql`SELECT * FROM "user"`;
  const statesAfter = await harness.sql`SELECT * FROM user_document_rebuild_state`;
  const outboxAfter = await harness.sql`SELECT * FROM user_document_outbox`;
  const documents = await harness.sql`SELECT * FROM user_document`;
  const tables =
    await harness.sql`SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='user_profile'`;
  const journalAfter = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  await migrate(db, options);
  const journalRepeated = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect([...sourcesAfter]).toEqual([...sources]);
  expect([...statesAfter]).toEqual([...states]);
  expect([...outboxAfter]).toEqual([...outbox]);
  expect([...documents]).toEqual([]);
  expect([...tables]).toEqual([]);
  expect(journalAfter.length).toBe(journal.length + 1);
  expect([...journalAfter].slice(0, journal.length)).toEqual([...journal]);
  expect([...journalRepeated]).toEqual([...journalAfter]);
});
