import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createUnitOfWork } from "@iam/api-core/uow";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import type { DbTransaction } from "@iam/db";
import { sql } from "drizzle-orm";
import { createOrganizationSearchInvalidation, type OrganizationSearchSourceChange } from "../../src/producer";
import { createOrganizationSearchQueryRepository, createOrganizationSearchQueryService } from "../../src/query";
import type { OrganizationSearchDocument } from "../../src/schema";
import {
  createOrganizationSearchProcessor,
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
});
afterAll(async () => {
  await harness?.close();
});

test.each([
  { id: 2, label: "parent branch", name: "Renamed company", rootName: "Root", companyName: "Renamed company" },
  { id: 1, label: "higher root", name: "Renamed root", rootName: "Renamed root", companyName: "Company" },
])(
  "a new descendant published before its $label commits is covered by the committed subtree expansion",
  async (ancestorChange) => {
    const work = await createPublishedTree();
    const ancestor = await holdSourceChange(work, ancestorChange.id, ["name"], async (sourceDb) => {
      await sourceDb.execute(
        sql`UPDATE organization SET org_name=${ancestorChange.name} WHERE id=${ancestorChange.id}`,
      );
    });
    try {
      await createNewDescendant(work);
      await work.drain();
      const beforeCommit = await work.search("NEW-LEAF");
      expect(beforeCommit).toEqual([newDescendantDocument("Root", "Company")]);
      const oldVersion = await readPublicationVersion(4);
      expect(oldVersion).toEqual({ version: "1", sourceVersion: "1", status: "processed" });

      await ancestor.commit();
      await work.drain();
      const afterCommit = await work.search("NEW-LEAF");
      expect(afterCommit).toEqual([newDescendantDocument(ancestorChange.rootName, ancestorChange.companyName)]);
      const newVersion = await readPublicationVersion(4);
      expect(newVersion).toEqual({ version: "2", sourceVersion: "2", status: "processed" });
    } finally {
      await ancestor.commit();
    }
  },
);

test("a descendant committed after the ancestor has expanded builds the new path from its own creation work", async () => {
  const work = await createPublishedTree();
  const descendant = await holdNewDescendant(work);
  let ancestor: Awaited<ReturnType<typeof holdSourceChange>> | undefined;
  try {
    ancestor = await holdSourceChange(work, 2, ["name"], async (sourceDb) => {
      await sourceDb.execute(sql`UPDATE organization SET org_name='Renamed company' WHERE id=2`);
    });
    await ancestor.commit();
    await work.drain();
    const beforeDescendantCommit = await work.search("NEW-LEAF");
    expect(beforeDescendantCommit).toEqual([]);

    await descendant.commit();
    await work.drain();
    const afterDescendantCommit = await work.search("NEW-LEAF");
    expect(afterDescendantCommit).toEqual([newDescendantDocument("Root", "Renamed company")]);
    const version = await readPublicationVersion(4);
    expect(version).toEqual({ version: "1", sourceVersion: "1", status: "processed" });
  } finally {
    await ancestor?.commit();
    await descendant.commit();
  }
});

test("concurrent changes to two ancestors both advance the shared descendant and converge to one complete path", async () => {
  const work = await createPublishedTree();
  await createNewDescendant(work);
  await work.drain();
  const root = await holdSourceChange(work, 1, ["name"], async (sourceDb) => {
    await sourceDb.execute(sql`UPDATE organization SET org_name='Renamed root' WHERE id=1`);
  });
  let company: Awaited<ReturnType<typeof holdSourceChange>> | undefined;
  try {
    company = await holdSourceChange(work, 2, ["name"], async (sourceDb) => {
      await sourceDb.execute(sql`UPDATE organization SET org_name='Renamed company' WHERE id=2`);
    });
    await company.commit();
    await root.commit();
  } finally {
    await company?.commit();
    await root.commit();
  }

  const blocker = await harness.sql.reserve();
  const expansions: Promise<unknown>[] = [];
  try {
    await blocker.unsafe("BEGIN");
    await blocker`SELECT organization_id FROM organization_search_dirty WHERE organization_id=4 FOR UPDATE`;
    expansions.push(work.processor.processSourceChange(work.sourceJobs.shift()!));
    expansions.push(work.processor.processSourceChange(work.sourceJobs.shift()!));
    await waitForDirtyLockWaiters(2);
    await blocker.unsafe("COMMIT");
    await Promise.all(expansions);
    await work.drain();

    const final = await work.search("NEW-LEAF");
    expect(final).toEqual([newDescendantDocument("Renamed root", "Renamed company")]);
    const version = await readPublicationVersion(4);
    expect(version).toEqual({ version: "3", sourceVersion: "3", status: "processed" });
  } finally {
    await blocker.unsafe("ROLLBACK");
    blocker.release();
    await Promise.allSettled(expansions);
  }
});

test("an older expansion cannot acknowledge away a new change committed while it is waiting", async () => {
  const work = await createPublishedTree();
  await createNewDescendant(work);
  await work.drain();
  await recordChange(work, 2, ["name"], async (sourceDb) => {
    await sourceDb.execute(sql`UPDATE organization SET org_name='Intermediate company' WHERE id=2`);
  });
  const blocker = await harness.sql.reserve();
  const expansions: Promise<unknown>[] = [];
  try {
    await blocker.unsafe("BEGIN");
    await blocker`SELECT organization_id FROM organization_search_dirty WHERE organization_id=4 FOR UPDATE`;
    expansions.push(work.processor.processSourceChange(work.sourceJobs.shift()!));
    await waitForDirtyLockWaiters(1);
    await recordChange(work, 2, ["name"], async (sourceDb) => {
      await sourceDb.execute(sql`UPDATE organization SET org_name='Latest company' WHERE id=2`);
    });
    expansions.push(work.processor.processSourceChange(work.sourceJobs.shift()!));
    await waitForDirtyLockWaiters(2);
    await blocker.unsafe("COMMIT");
    await Promise.all(expansions);
    await work.drain();

    const final = await work.search("NEW-LEAF");
    expect(final).toEqual([newDescendantDocument("Root", "Latest company")]);
    const version = await readPublicationVersion(4);
    expect(version).toEqual({ version: "3", sourceVersion: "3", status: "processed" });
  } finally {
    await blocker.unsafe("ROLLBACK");
    blocker.release();
    await Promise.allSettled(expansions);
  }
});

test("successive ancestor code and name patches keep stable work identity and reject a late intermediate candidate", async () => {
  const work = await createPublishedTree();
  await createNewDescendant(work);
  await work.drain();
  await recordChange(work, 2, ["code", "name", "type", "status"], async (sourceDb) => {
    await sourceDb.execute(sql`UPDATE organization SET org_code='COMPANY-V2', org_name='Second company',
      org_type=${OrganizationType.TempDepartment}, status=${OrganizationStatus.Pause} WHERE id=2`);
  });
  await work.processor.processSourceChange(work.sourceJobs.shift()!);
  const intermediate = await work.processor.prepareRebuild({ organizationId: 4, version: "2" });
  expect(intermediate?.document).toEqual(
    newDescendantDocument("Root", "Second company", "COMPANY-V2", OrganizationType.TempDepartment),
  );

  await recordChange(work, 2, ["code", "name", "status"], async (sourceDb) => {
    await sourceDb.execute(sql`UPDATE organization SET org_code='COMPANY-V3', org_name='Third company',
      status=${OrganizationStatus.Disable} WHERE id=2`);
  });
  await work.processor.processSourceChange(work.sourceJobs.shift()!);
  const newest = await work.processor.prepareRebuild({ organizationId: 4, version: "3" });
  expect(newest).not.toBeNull();
  const publication = await work.processor.publishPrepared(newest!);
  const latePublication = await work.processor.publishPrepared(intermediate!);
  await work.drain();

  expect(publication).toEqual({ status: "published" });
  expect(latePublication).toEqual({ status: "stale" });
  const final = await work.search("NEW-LEAF");
  expect(final).toEqual([
    newDescendantDocument("Root", "Third company", "COMPANY-V3", OrganizationType.TempDepartment),
  ]);
  const version = await readPublicationVersion(4);
  expect(version).toEqual({ version: "3", sourceVersion: "3", status: "processed" });
  const oldSubtree = await work.searchSubtree("COMPANY");
  const newSubtree = await work.searchSubtree("COMPANY-V3");
  expect(oldSubtree).toEqual([]);
  expect(newSubtree.map(({ organization }) => organization.code)).toEqual(["COMPANY-V3", "DEPARTMENT", "NEW-LEAF"]);
});

test("a failed expansion retries over newly committed descendants and repeated delivery keeps the converged version", async () => {
  const work = await createPublishedTree();
  await recordChange(work, 2, ["name"], async (sourceDb) => {
    await sourceDb.execute(sql`UPDATE organization SET org_name='Recovered company' WHERE id=2`);
  });
  const ancestorChange = work.sourceJobs.shift()!;
  await harness.sql.unsafe(`CREATE FUNCTION interrupt_ancestor_expansion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.organization_id=3 THEN RAISE EXCEPTION 'controlled ancestor expansion interruption'; END IF;
      RETURN NEW; END $$`);
  await harness.sql.unsafe(`CREATE TRIGGER interrupt_ancestor_expansion BEFORE INSERT OR UPDATE
    ON organization_search_dirty FOR EACH ROW EXECUTE FUNCTION interrupt_ancestor_expansion()`);
  try {
    const failure = await captureRejection(work.processor.processSourceChange(ancestorChange));
    expect(failure).toBeInstanceOf(Error);
    const retained = await work.search("DEPARTMENT");
    expect(retained).toMatchObject([
      { organization: { path: [{ name: "Root" }, { name: "Company" }, { name: "Department" }] } },
    ]);
    const retainedVersion = await readPublicationVersion(3);
    expect(retainedVersion).toEqual({ version: "1", sourceVersion: "1", status: "processed" });
  } finally {
    await harness.sql.unsafe("DROP TRIGGER interrupt_ancestor_expansion ON organization_search_dirty");
    await harness.sql.unsafe("DROP FUNCTION interrupt_ancestor_expansion()");
  }

  // This descendant did not exist in the rolled-back expansion's closure snapshot.
  await createNewDescendant(work);
  await work.drain();
  const initialDescendantVersion = await readPublicationVersion(4);
  expect(initialDescendantVersion).toEqual({ version: "1", sourceVersion: "1", status: "processed" });
  await work.processor.processSourceChange(ancestorChange);
  await work.drain();
  const recovered = await work.search("NEW-LEAF");
  expect(recovered).toEqual([newDescendantDocument("Root", "Recovered company")]);
  const recoveredVersion = await readPublicationVersion(4);
  expect(recoveredVersion).toEqual({ version: "2", sourceVersion: "2", status: "processed" });

  await work.processor.processSourceChange(ancestorChange);
  await work.drain();
  const repeatedVersion = await readPublicationVersion(4);
  expect(repeatedVersion).toEqual({ version: "2", sourceVersion: "2", status: "processed" });
  const repeated = await work.search("NEW-LEAF");
  expect(repeated).toEqual(recovered);
});

async function createPublishedTree() {
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type, status)
    VALUES (1, 'ROOT', 'Root', -1, '/1', 1, ${OrganizationType.Company}, ${OrganizationStatus.Pause}),
      (2, 'COMPANY', 'Company', 1, '/1/2', 2, ${OrganizationType.Company}, ${OrganizationStatus.Disable}),
      (3, 'DEPARTMENT', 'Department', 2, '/1/2/3', 3, ${OrganizationType.Department}, ${OrganizationStatus.Pause})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth)
    VALUES (1,1,0), (1,2,1), (1,3,2), (2,2,0), (2,3,1), (3,3,0)`;
  const work = createWork();
  await work.processor.backfillAllOrganizations();
  await work.drain();
  return work;
}

function createWork() {
  const sourceJobs: OrganizationSourceChangeJobPayload[] = [];
  const rebuildJobs: OrganizationRebuildJobPayload[] = [];
  const producer = {
    async enqueueSourceChanges(payloads: readonly OrganizationSourceChangeJobPayload[]) {
      sourceJobs.push(...payloads);
      return { enqueued: payloads.length };
    },
    async enqueueRebuilds(payloads: readonly OrganizationRebuildJobPayload[]) {
      rebuildJobs.push(...payloads);
      return { enqueued: payloads.length };
    },
  };
  const processor = createOrganizationSearchProcessor({ db: harness.db, jobProducer: producer });
  const query = createOrganizationSearchQueryService({
    repository: createOrganizationSearchQueryRepository(harness.db),
  });
  const uow = createUnitOfWork({
    db: harness.db,
    logger: { warn() {}, error() {} },
    createTxPorts(sourceDb, lifecycle) {
      return {
        sourceDb,
        invalidation: createOrganizationSearchInvalidation({ db: sourceDb, lifecycle, jobProducer: producer }),
      };
    },
  });
  return {
    processor,
    uow,
    sourceJobs,
    rebuildJobs,
    async drain() {
      while (sourceJobs.length > 0) await processor.processSourceChange(sourceJobs.shift()!);
      while (rebuildJobs.length > 0) await processor.processRebuild(rebuildJobs.shift()!);
    },
    async search(code: string) {
      return await query.search({ filter: { field: "organization.code", op: "eq", value: code } });
    },
    async searchSubtree(code: string) {
      return await query.search({ filter: { field: "organization", op: "withinSubtreeOf", value: code } });
    },
  };
}

type Work = ReturnType<typeof createWork>;

async function recordChange(
  work: Work,
  organizationId: number,
  changedFields: Extract<OrganizationSearchSourceChange, { kind: "updated" }>["changedFields"],
  write: (sourceDb: DbTransaction) => Promise<void>,
) {
  await work.uow.transaction(async ({ sourceDb, invalidation }) => {
    await write(sourceDb);
    await invalidation.recordChanges([{ kind: "updated", organizationId, changedFields }]);
  });
}

async function createNewDescendant(work: Work, beforeCommit?: () => Promise<void>) {
  await work.uow.transaction(async ({ sourceDb, invalidation }) => {
    await sourceDb.execute(sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type, status)
      VALUES (4, 'NEW-LEAF', 'New leaf', 3, '/1/2/3/4', 4, ${OrganizationType.Department}, ${OrganizationStatus.Disable})`);
    await sourceDb.execute(sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth)
      VALUES (1,4,3), (2,4,2), (3,4,1), (4,4,0)`);
    await invalidation.recordChanges([{ kind: "created", organizationId: 4 }]);
    await beforeCommit?.();
  });
}

async function holdNewDescendant(work: Work) {
  const ready = deferred();
  const release = deferred();
  const transaction = createNewDescendant(work, async () => {
    ready.resolve();
    await release.promise;
  });
  void transaction.catch(ready.reject);
  await ready.promise;
  return {
    async commit() {
      release.resolve();
      await transaction;
    },
  };
}

async function holdSourceChange(
  work: Work,
  organizationId: number,
  changedFields: Extract<OrganizationSearchSourceChange, { kind: "updated" }>["changedFields"],
  write: (sourceDb: DbTransaction) => Promise<void>,
) {
  const ready = deferred();
  const release = deferred();
  const transaction = work.uow.transaction(async ({ sourceDb, invalidation }) => {
    await write(sourceDb);
    await invalidation.recordChanges([{ kind: "updated", organizationId, changedFields }]);
    ready.resolve();
    await release.promise;
  });
  void transaction.catch(ready.reject);
  await ready.promise;
  return {
    async commit() {
      release.resolve();
      await transaction;
    },
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function newDescendantDocument(
  rootName: string,
  companyName: string,
  companyCode = "COMPANY",
  companyType = OrganizationType.Company,
): OrganizationSearchDocument {
  return {
    organization: {
      code: "NEW-LEAF",
      name: "New leaf",
      type: OrganizationType.Department,
      status: OrganizationStatus.Disable,
      level: 4,
      isVirtual: false,
      isEntity: false,
      path: [
        { code: "ROOT", name: rootName, type: OrganizationType.Company, level: 1, distanceToTarget: 3 },
        { code: companyCode, name: companyName, type: companyType, level: 2, distanceToTarget: 2 },
        { code: "DEPARTMENT", name: "Department", type: OrganizationType.Department, level: 3, distanceToTarget: 1 },
        { code: "NEW-LEAF", name: "New leaf", type: OrganizationType.Department, level: 4, distanceToTarget: 0 },
      ],
    },
  };
}

async function readPublicationVersion(organizationId: number) {
  const [row] = await harness.sql<{ version: string; sourceVersion: string; status: string }[]>`
    SELECT dirty.version::text AS version, document.source_version::text AS "sourceVersion", dirty.status
    FROM organization_search_dirty dirty
    JOIN organization_search_document document USING (organization_id)
    WHERE organization_id=${organizationId}`;
  return row;
}

async function waitForDirtyLockWaiters(count: number) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const [row] = await harness.sql<{ waiters: number }[]>`SELECT COUNT(*)::int AS waiters FROM pg_stat_activity
      WHERE application_name=current_setting('application_name') AND wait_event_type='Lock'
        AND query LIKE '%organization_search_dirty%'`;
    if (row && row.waiters >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Organization subtree expansions did not reach the controlled dirty row lock");
}

async function captureRejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the controlled ancestor expansion to fail");
}
