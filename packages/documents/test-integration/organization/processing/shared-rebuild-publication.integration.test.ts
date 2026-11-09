import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { OrganizationType } from "@iam/contracts";
import type { OrganizationOutboxJobPayload, OrganizationRebuildJobPayload } from "../../../src/organization/producer";
import { createOrganizationDocumentProcessor } from "../../../src/organization/worker";
import { createOrganizationDocumentPostgresTestHarness } from "../support/postgres-test-harness";

let harness: Awaited<ReturnType<typeof createOrganizationDocumentPostgresTestHarness>>;
beforeAll(async () => {
  harness = await createOrganizationDocumentPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

test("the shared publisher bounds an Organization row lock wait and leaves skipped locked work recoverable", async () => {
  const { processor, request, rebuildJobs } = await readyWork();
  const prepared = await processor.prepareRebuild(request);
  if (!prepared) throw new Error("The pending Organization rebuild could not be claimed");
  const blocker = await harness.sql.reserve();
  let publication: ReturnType<typeof observePublication> | undefined;
  try {
    await blocker.unsafe("BEGIN");
    await blocker`SELECT organization_id FROM organization_document_rebuild_state WHERE organization_id=1 FOR UPDATE`;
    const started = performance.now();
    publication = observePublication(processor.publishPrepared(prepared));
    const outcome = await within(publication, 6_500);
    expect(outcome.error).toBeInstanceOf(Error);
    expect(performance.now() - started).toBeLessThan(6_500);
    // The external owner still holds the row. Failure cleanup must skip it
    // instead of starting another unbounded wait after lock_timeout rolls back.
    const [held] = await harness.sql`SELECT version,status,processing_token
      FROM organization_document_rebuild_state WHERE organization_id=1`;
    const documents = await harness.sql`SELECT document FROM organization_document WHERE organization_id=1`;
    expect(held).toEqual({ version: "1", status: "processing", processing_token: prepared.processingToken });
    expect(documents).toHaveLength(0);
  } finally {
    await blocker.unsafe("ROLLBACK");
    blocker.release();
    await publication;
  }

  const repair = await processor.repairFailedOrStale({ staleBefore: new Date(Date.now() + 60_000), limit: 10 });
  expect(repair.rebuilds).toEqual({ selected: 1, enqueued: 1, failed: 0 });
  const retry = rebuildJobs.at(-1);
  if (!retry) throw new Error("Repair did not wake the retained Organization rebuild");
  const recovered = await processor.processRebuild(retry);
  const row = await publishedState();
  expect(recovered).toEqual({ status: "published" });
  expect(row).toEqual({
    name: "Before",
    source_version: "1",
    version: "1",
    status: "processed",
    processing_token: null,
  });
}, 15_000);

test("a reclaimed Organization version rejects the former token without completing the new owner's work", async () => {
  const { processor, request } = await readyWork();
  const oldCandidate = await processor.prepareRebuild(request);
  if (!oldCandidate) throw new Error("The original Organization rebuild could not be claimed");
  await processor.repairFailedOrStale({ staleBefore: new Date(Date.now() + 60_000), limit: 10 });
  const newCandidate = await processor.prepareRebuild(request);
  if (!newCandidate) throw new Error("The stale Organization rebuild was not reclaimable");
  expect(newCandidate.processingToken).not.toBe(oldCandidate.processingToken);

  const late = await processor.publishPrepared(oldCandidate);
  const [owned] = await harness.sql`SELECT version,status,processing_token
    FROM organization_document_rebuild_state WHERE organization_id=1`;
  const prematureDocuments = await harness.sql`SELECT document FROM organization_document WHERE organization_id=1`;
  expect(late).toEqual({ status: "stale" });
  expect(owned).toEqual({ version: "1", status: "processing", processing_token: newCandidate.processingToken });
  expect(prematureDocuments).toHaveLength(0);

  const current = await processor.publishPrepared(newCandidate);
  const row = await publishedState();
  expect(current).toEqual({ status: "published" });
  expect(row).toEqual({
    name: "Before",
    source_version: "1",
    version: "1",
    status: "processed",
    processing_token: null,
  });
});

test("Organization Document and processed status roll back together when completion fails, then repair publishes both", async () => {
  const { processor, request, rebuildJobs } = await readyWork();
  await harness.sql.unsafe(`CREATE FUNCTION reject_organization_completion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.status='processed' THEN
      RAISE EXCEPTION 'controlled Organization completion failure' USING ERRCODE='23514';
    END IF; RETURN NEW; END $$`);
  await harness.sql.unsafe(`CREATE TRIGGER reject_organization_completion BEFORE UPDATE
    ON organization_document_rebuild_state FOR EACH ROW EXECUTE FUNCTION reject_organization_completion()`);
  try {
    const failed = await observePublication(processor.processRebuild(request));
    const documents = await harness.sql`SELECT document FROM organization_document WHERE organization_id=1`;
    const [state] = await harness.sql`SELECT version,status,processing_token
      FROM organization_document_rebuild_state WHERE organization_id=1`;
    expect(failed.error).toBeInstanceOf(Error);
    expect(documents).toHaveLength(0);
    expect(state).toEqual({ version: "1", status: "failed", processing_token: null });
  } finally {
    await harness.sql.unsafe("DROP TRIGGER reject_organization_completion ON organization_document_rebuild_state");
    await harness.sql.unsafe("DROP FUNCTION reject_organization_completion()");
  }

  const repair = await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 10 });
  expect(repair.rebuilds).toEqual({ selected: 1, enqueued: 1, failed: 0 });
  const retry = rebuildJobs.at(-1);
  if (!retry) throw new Error("Repair did not wake the failed Organization rebuild");
  const published = await processor.processRebuild(retry);
  const row = await publishedState();
  expect(published).toEqual({ status: "published" });
  expect(row).toEqual({
    name: "Before",
    source_version: "1",
    version: "1",
    status: "processed",
    processing_token: null,
  });
});

async function readyWork() {
  await harness.sql`INSERT INTO organization (id,org_code,org_name,parent_id,path,level,org_type)
    VALUES (1,'ROOT','Before',-1,'/1',1,${OrganizationType.Department})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0)`;
  const sourceJobs: OrganizationOutboxJobPayload[] = [];
  const rebuildJobs: OrganizationRebuildJobPayload[] = [];
  const processor = createOrganizationDocumentProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueOutboxEntries(payloads) {
        sourceJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        rebuildJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
    },
  });
  await processor.backfillAllOrganizations();
  for (const payload of sourceJobs) await processor.processOutbox(payload);
  const request = rebuildJobs.shift();
  if (!request) throw new Error("Backfill did not register an Organization rebuild");
  return { processor, request, rebuildJobs };
}

async function publishedState() {
  const [row] = await harness.sql`SELECT document->>'name' AS name,source_version,version,status,processing_token
    FROM organization_document JOIN organization_document_rebuild_state USING (organization_id) WHERE organization_id=1`;
  return row;
}

async function observePublication<T>(operation: Promise<T>) {
  try {
    return { value: await operation, error: undefined };
  } catch (error) {
    return { value: undefined, error };
  }
}

async function within<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Organization publication exceeded its lock-wait budget")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
