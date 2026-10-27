import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const migrations = new URL("../../src/migrations/", import.meta.url);
const target = "20261026080340_organization_document";
let harness: PostgresTestHarness;
let baselineDirectory: string;
beforeEach(async () => {
  harness = await createPostgresTestHarness();
  baselineDirectory = await mkdtemp(join(tmpdir(), "iam-organization-document-migration-"));
});
afterEach(async () => {
  await harness?.close();
  if (baselineDirectory) await rm(baselineDirectory, { recursive: true });
});

test("formal upgrade preserves processed receipts, versions and in-flight ownership without resetting its journal", async () => {
  const previous = (await readdir(migrations, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && entry.name < target,
  );
  for (const entry of previous)
    await cp(new URL(entry.name, migrations), join(baselineDirectory, entry.name), { recursive: true });
  const db = drizzle({ client: harness.sql });
  await migrate(db, { migrationsFolder: baselineDirectory, migrationsSchema: harness.schemaName });
  await harness.sql`INSERT INTO organization (id,org_code,org_name,path,level,org_type)
    VALUES (1,'ROOT','Root','/1',1,'部门'), (2,'OTHER','Other','/2',1,'部门')`;
  await harness.sql`INSERT INTO organization_search_dirty (organization_id,version,status,processed_at)
    VALUES (1,7,'processed','2026-10-25')`;
  await harness.sql`INSERT INTO organization_search_dirty (organization_id,version,status,processing_token,processing_started_at)
    VALUES (2,8,'processing','00000000-0000-4000-8000-000000000002','2026-10-25')`;
  await harness.sql`INSERT INTO organization_search_change (id,organization_id,scope,status,processed_at,rebuild_requests)
    VALUES ('00000000-0000-4000-8000-000000000001',1,'self','processed','2026-10-25','[{"organizationId":1,"version":"7"}]')`;
  await harness.sql`INSERT INTO organization_search_change (id,organization_id,scope,status,processing_token,processing_started_at)
    VALUES ('00000000-0000-4000-8000-000000000003',2,'self','processing','00000000-0000-4000-8000-000000000004','2026-10-25')`;
  await harness.sql`INSERT INTO organization_search_document (organization_id,document,schema_version,source_version,search_visible)
    VALUES (1,'{"organization":{"code":"ROOT"}}',1,7,TRUE)`;
  const sourceBefore = await harness.sql`SELECT * FROM organization ORDER BY id`;
  const journalBefore = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  await cp(new URL(target, migrations), join(baselineDirectory, target), { recursive: true });
  const options = { migrationsFolder: baselineDirectory, migrationsSchema: harness.schemaName };
  await migrate(db, options);
  const sourceAfter = await harness.sql`SELECT * FROM organization ORDER BY id`;
  const outbox =
    await harness.sql`SELECT organization_id,status,processing_token,rebuild_requests FROM organization_document_outbox ORDER BY organization_id`;
  const states =
    await harness.sql`SELECT organization_id,version,status,processing_token FROM organization_document_rebuild_state ORDER BY organization_id`;
  const documents = await harness.sql`SELECT source_version,document FROM organization_document`;
  const journalAfter = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  await migrate(db, options);
  const repeatedJournal = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect([...sourceAfter]).toEqual([...sourceBefore]);
  expect(outbox[0]).toEqual({
    organization_id: 1,
    status: "processed",
    processing_token: null,
    rebuild_requests: [{ targetId: 1, version: "7" }],
  });
  expect(outbox[1]).toMatchObject({
    status: "processing",
    processing_token: "00000000-0000-4000-8000-000000000004",
    rebuild_requests: [],
  });
  expect([...states]).toEqual([
    { organization_id: 1, version: "7", status: "processed", processing_token: null },
    {
      organization_id: 2,
      version: "8",
      status: "processing",
      processing_token: "00000000-0000-4000-8000-000000000002",
    },
  ]);
  expect(documents[0]).toEqual({ source_version: "7", document: { organization: { code: "ROOT" } } });
  expect(journalAfter.length).toBe(journalBefore.length + 1);
  expect([...journalAfter].slice(0, journalBefore.length)).toEqual([...journalBefore]);
  expect([...repeatedJournal]).toEqual([...journalAfter]);
});
