import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import { createOrganizationSearchQueryRepository, createOrganizationSearchQueryService } from "../../src/query";
import {
  createOrganizationSearchProcessor,
  createOrganizationSearchVerifier,
  type OrganizationRebuildJobPayload,
  type OrganizationSourceChangeJobPayload,
} from "../../src/worker";
import {
  createOrganizationSearchPostgresTestHarness,
  type OrganizationSearchPostgresTestHarness,
} from "./postgres-test-harness";

let harness: OrganizationSearchPostgresTestHarness;
beforeAll(async () => {
  harness = await createOrganizationSearchPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type, status, is_delete)
    VALUES (1, 'ROOT', 'Root', -1, '/1', 1, ${OrganizationType.Department}, ${OrganizationStatus.Pause}, false),
      (2, 'CHILD', 'Child', 1, '/1/2', 2, ${OrganizationType.Department}, ${OrganizationStatus.Disable}, true)`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (1,1,0), (1,2,1), (2,2,0)`;
});
afterAll(async () => {
  await harness?.close();
});

test("full verification rejects every missing publication and deletion tombstone before first build", async () => {
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

  expect(report.status).toBe("failed");
  expect(report.counts).toMatchObject({ organizations: 2, deletedOrganizations: 1, documents: 0, dirty: 0 });
  expect(report.failures).toEqual([
    { code: "missing-document", count: 2, organizationIds: [1, 2], changeIds: [] },
    { code: "missing-dirty", count: 2, organizationIds: [1, 2], changeIds: [] },
  ]);
});

test("normal first build passes a complete independent inventory including processed deletion tombstones", async () => {
  await publishAll();
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

  expect(report).toMatchObject({
    schemaVersion: 1,
    status: "passed",
    counts: {
      organizations: 2,
      deletedOrganizations: 1,
      documents: 2,
      visibleDocuments: 1,
      tombstones: 1,
      dirty: 2,
      changes: 2,
    },
    failures: [],
  });
});

async function publishAll() {
  const sourceJobs: OrganizationSourceChangeJobPayload[] = [];
  const rebuildJobs: OrganizationRebuildJobPayload[] = [];
  const processor = createOrganizationSearchProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueSourceChanges(payloads) {
        sourceJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        rebuildJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
    },
  });
  await processor.backfillAllOrganizations({ batchSize: 1 });
  for (const payload of sourceJobs) await processor.processSourceChange(payload);
  for (const payload of rebuildJobs) await processor.processRebuild(payload);
  return processor;
}

test("verification rejects old schema rows including tombstones while online search only filters those rows", async () => {
  await publishAll();
  await harness.sql`UPDATE organization_search_document SET schema_version = 2`;
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();
  const search = createOrganizationSearchQueryService({
    repository: createOrganizationSearchQueryRepository(harness.db),
  });
  const visible = await search.search({ filter: { field: "organization.code", op: "eq", value: "ROOT" } });

  expect(report.failures).toContainEqual({ code: "schema-mismatch", count: 2, organizationIds: [1, 2], changeIds: [] });
  expect(report.status).toBe("failed");
  expect(visible).toEqual([]);
});

for (const corruption of ["extra-field", "wrong-distance"] as const) {
  test(`strict verification rejects a ${corruption} document without changing its inventory`, async () => {
    await publishAll();
    if (corruption === "extra-field")
      await harness.sql`UPDATE organization_search_document SET document = document || '{"internalId":1}'::jsonb WHERE organization_id = 1`;
    else
      await harness.sql`UPDATE organization_search_document SET document = jsonb_set(document, '{organization,path,0,distanceToTarget}', '1'::jsonb) WHERE organization_id = 1`;
    const before = await harness.sql`SELECT * FROM organization_search_document ORDER BY organization_id`;
    const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();
    const after = await harness.sql`SELECT * FROM organization_search_document ORDER BY organization_id`;

    expect(report.status).toBe("failed");
    expect(report.failures).toContainEqual({ code: "invalid-document", count: 1, organizationIds: [1], changeIds: [] });
    expect(Array.from(after)).toEqual(Array.from(before));
  });
}

test("verification compares full source facts and deletion state rather than trusting structurally valid documents", async () => {
  await publishAll();
  await harness.sql`UPDATE organization SET org_name = 'New root', is_virtual = true WHERE id = 1`;
  await harness.sql`UPDATE organization SET is_delete = false WHERE id = 2`;
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

  expect(report.status).toBe("failed");
  expect(report.failures).toContainEqual({ code: "source-mismatch", count: 2, organizationIds: [1, 2], changeIds: [] });
});

test("verification reports all invalid source paths without aborting the remaining organization scan", async () => {
  await publishAll();
  await harness.sql`UPDATE organization SET is_delete = false WHERE id = 2`;
  await harness.sql`UPDATE organization SET path = '/999' WHERE id = 1`;
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

  expect(report.status).toBe("failed");
  expect(report.failures).toContainEqual({
    code: "invalid-source-path",
    count: 2,
    organizationIds: [1, 2],
    changeIds: [],
  });
});

for (const status of ["pending", "processing", "failed"] as const) {
  test(`full verification rejects ${status} work in both durable stages`, async () => {
    await publishAll();
    const token = status === "processing" ? randomUUID() : null;
    const startedAt = status === "processing" ? new Date().toISOString() : null;
    await harness.sql`UPDATE organization_search_change SET status = ${status}, processing_token = ${token}, processing_started_at = ${startedAt}, processed_at = NULL`;
    await harness.sql`UPDATE organization_search_dirty SET status = ${status}, processing_token = ${token}, processing_started_at = ${startedAt}, processed_at = NULL`;
    const changes = await harness.sql<{ id: string }[]>`SELECT id FROM organization_search_change ORDER BY id`;
    const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

    expect(report.status).toBe("failed");
    expect(report.failures).toContainEqual({
      code: "unprocessed-dirty",
      count: 2,
      organizationIds: [1, 2],
      changeIds: [],
    });
    expect(report.failures).toContainEqual({
      code: "unprocessed-change",
      count: 2,
      organizationIds: [1, 2],
      changeIds: changes.map((row) => row.id),
    });
  });
}

test("verification rejects publication versions that differ from processed work for live rows and tombstones", async () => {
  await publishAll();
  await harness.sql`UPDATE organization_search_document SET source_version = 9`;
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

  expect(report.status).toBe("failed");
  expect(report.failures).toContainEqual({
    code: "version-mismatch",
    count: 2,
    organizationIds: [1, 2],
    changeIds: [],
  });
});

test("processed status cannot replace completion receipts for either durable stage", async () => {
  await publishAll();
  await harness.sql`UPDATE organization_search_change SET processed_at = NULL`;
  await harness.sql`UPDATE organization_search_dirty SET processed_at = NULL`;
  const changes = await harness.sql<{ id: string }[]>`SELECT id FROM organization_search_change ORDER BY id`;
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

  expect(report.status).toBe("failed");
  expect(report.failures).toContainEqual({
    code: "invalid-dirty-receipt",
    count: 2,
    organizationIds: [1, 2],
    changeIds: [],
  });
  expect(report.failures).toContainEqual({
    code: "invalid-change-receipt",
    count: 2,
    organizationIds: [1, 2],
    changeIds: changes.map((row) => row.id),
  });
});

test("verification rejects completed source events whose recorded rebuild versions were never fulfilled", async () => {
  await publishAll();
  await harness.sql`UPDATE organization_search_change SET rebuild_requests = jsonb_build_array(jsonb_build_object('organizationId', organization_id, 'version', '9'))`;
  const changes = await harness.sql<{ id: string }[]>`SELECT id FROM organization_search_change ORDER BY id`;
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

  expect(report.status).toBe("failed");
  expect(report.failures).toContainEqual({
    code: "unfulfilled-change",
    count: 2,
    organizationIds: [1, 2],
    changeIds: changes.map((row) => row.id),
  });
});

for (const corruption of ["empty", "invalid-version"] as const) {
  test(`verification diagnoses ${corruption} expansion receipts instead of trusting processed status`, async () => {
    await publishAll();
    if (corruption === "empty") await harness.sql`UPDATE organization_search_change SET rebuild_requests = '[]'::jsonb`;
    else
      await harness.sql`UPDATE organization_search_change SET rebuild_requests = jsonb_build_array(jsonb_build_object('organizationId', organization_id, 'version', 'invalid'))`;
    const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();
    const changes = await harness.sql<{ id: string }[]>`SELECT id FROM organization_search_change ORDER BY id`;

    expect(report.status).toBe("failed");
    expect(report.failures).toContainEqual({
      code: "invalid-change-receipt",
      count: 2,
      organizationIds: [1, 2],
      changeIds: changes.map((row) => row.id),
    });
  });
}

test("full verification rejects orphan publications and durable work outside the source inventory", async () => {
  await publishAll();
  const changeId = randomUUID();
  await harness.sql`INSERT INTO organization_search_document (organization_id, document, schema_version, source_version, search_visible) VALUES (999, NULL, 1, 1, false)`;
  await harness.sql`INSERT INTO organization_search_dirty (organization_id, version, status, processed_at) VALUES (999, 1, 'processed', now())`;
  await harness.sql`INSERT INTO organization_search_change (id, organization_id, scope, status, processed_at, rebuild_requests)
    VALUES (${changeId}, 999, 'self', 'processed', now(), '[{"organizationId":999,"version":"1"}]'::jsonb)`;
  const report = await createOrganizationSearchVerifier({ db: harness.db }).verify();

  expect(report.status).toBe("failed");
  expect(report.failures).toContainEqual({ code: "orphan-document", count: 1, organizationIds: [999], changeIds: [] });
  expect(report.failures).toContainEqual({ code: "orphan-dirty", count: 1, organizationIds: [999], changeIds: [] });
  expect(report.failures).toContainEqual({
    code: "orphan-change",
    count: 1,
    organizationIds: [999],
    changeIds: [changeId],
  });
});

test("source reader, publications, deletion counts and both work stages share one repeatable-read snapshot", async () => {
  await publishAll();
  const locked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writer = harness.sql.begin(async (tx) => {
    await tx`LOCK TABLE organization_search_document IN ACCESS EXCLUSIVE MODE`;
    locked.resolve();
    await release.promise;
    await tx`UPDATE organization SET is_delete = true WHERE id = 1`;
    await tx`UPDATE organization_search_document SET document = NULL, search_visible = false, source_version = 2 WHERE organization_id = 1`;
    await tx`UPDATE organization_search_dirty SET version = 2 WHERE organization_id = 1`;
    await tx`UPDATE organization_search_change SET rebuild_requests = '[{"organizationId":1,"version":"2"}]'::jsonb WHERE organization_id = 1`;
  });
  await locked.promise;
  const verifying = createOrganizationSearchVerifier({ db: harness.db }).verify();
  try {
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline) {
      const locks =
        await harness.sql`SELECT pid FROM pg_locks WHERE relation = 'organization_search_document'::regclass AND NOT granted`;
      if (locks.length) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
  } finally {
    release.resolve();
    await writer;
  }
  const during = await verifying;
  const after = await createOrganizationSearchVerifier({ db: harness.db }).verify();
  expect(during).toMatchObject({
    status: "passed",
    counts: { deletedOrganizations: 1, visibleDocuments: 1, tombstones: 1 },
    failures: [],
  });
  expect(after).toMatchObject({
    status: "passed",
    counts: { deletedOrganizations: 2, visibleDocuments: 0, tombstones: 2 },
    failures: [],
  });
}, 10_000);
