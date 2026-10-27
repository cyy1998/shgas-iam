import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { UserDocumentRebuildReason, UserDocumentWorkStatus, UserStatus } from "@iam/contracts";
import type { db as database } from "@iam/db";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../../src/index";
import {
  createCurrentUserDocumentPostgresReadiness,
  createCurrentUserDocumentProjectionBundle,
  createUserDocumentPostgresGate,
  createUserDocumentReadinessRepository,
} from "../../src/worker";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

const OBSERVED_AT = new Date("2026-08-22T06:00:00.000Z");

describe("User Document schema 1 PostgreSQL readiness", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.sql`
      INSERT INTO "user" (
        id,
        subject_identifier,
        username,
        name,
        status,
        is_delete
      )
      VALUES (
        1,
        '00000000-0000-4000-8000-000000000001',
        'user-1',
        'User 1',
        ${UserStatus.Enable},
        false
      )
    `;
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("a complete ordinary publication passes independently of the backfill reason marker", async () => {
    const projection = createCurrentUserDocumentProjectionBundle();
    const candidate = await projection
      .createBuilder({
        db: harness.db,
        clock: { nowDate: () => OBSERVED_AT },
        batchSize: 1,
      })
      .buildOne({ userId: 1, sourceVersion: "1" });
    if (!candidate) throw new Error("Fixture user was not built");
    await projection.createRowRepository(harness.db).upsert(candidate);
    await harness.sql`INSERT INTO user_document_rebuild_state
      (user_id,version,status,reason_codes,processed_at,post_publication_version,
       post_publication_status,post_publication_completed_at)
      VALUES (1,1,'processed','[]',NOW(),1,'processed',NOW())`;
    const gate = createCurrentUserDocumentPostgresReadiness({
      db: harness.db,
      clock: { nowDate: () => OBSERVED_AT },
      config: { buildBatchSize: 1 },
    });
    const report = await gate.verify({ batchSize: 1 });
    expect(report.status).toBe("passed");
    expect(report.failures).toEqual([]);
    // A processed source message must prove that its direct target was durably registered.
    await harness.sql`INSERT INTO user_document_outbox (id,source,status,processed_at,rebuild_requests)
      VALUES ('00000000-0000-4000-8000-000000000101',
        '{"change":{"kind":"user","userId":1}}','processed',NOW(),'[]')`;
    const invalidReceipt = await gate.verify({ batchSize: 1 });
    expect(invalidReceipt.status).toBe("failed");
    expect(invalidReceipt.failures).toContainEqual({
      code: "invalid-outbox-receipt",
      count: 1,
      samples: ["outbox:00000000-0000-4000-8000-000000000101"],
    });
    await harness.sql`UPDATE user_document_outbox SET rebuild_requests='[{"targetId":1,"version":"1"}]'`;
    await harness.sql`UPDATE user_document SET source_version=2`;
    await harness.sql`UPDATE user_document_rebuild_state SET version=2,post_publication_version=2`;
    // Historical completed requests are satisfied by a newer completed publication.
    await harness.sql`INSERT INTO user_document_outbox (id,source,status,processed_at,rebuild_requests)
      VALUES ('00000000-0000-4000-8000-000000000102',
        '{"change":{"kind":"role","roleId":999}}','processed',NOW(),'[]')`;
    const historical = await gate.verify({ batchSize: 1 });
    expect(historical.status).toBe("passed");
    for (const status of ["pending", "failed", "processing"] as const) {
      await harness.sql`UPDATE user_document_outbox SET status=${status},
        processing_token=${status === "processing" ? "00000000-0000-4000-8000-000000000103" : null},
        processing_started_at=${status === "processing" ? OBSERVED_AT.toISOString() : null}
        WHERE id='00000000-0000-4000-8000-000000000101'`;
      const incomplete = await gate.verify({ batchSize: 1 });
      expect(incomplete.failures).toContainEqual({
        code: "unprocessed-outbox",
        count: 1,
        samples: ["outbox:00000000-0000-4000-8000-000000000101"],
      });
    }
    await harness.sql`UPDATE user_document_outbox SET status='processed',processing_token=NULL,processing_started_at=NULL`;
    await harness.sql`UPDATE user_document_outbox SET rebuild_requests='[{"targetId":1,"version":"3"}]'
      WHERE id='00000000-0000-4000-8000-000000000101'`;
    const unfulfilled = await gate.verify({ batchSize: 1 });
    expect(unfulfilled.failures).toContainEqual({
      code: "unfulfilled-outbox",
      count: 1,
      samples: ["outbox:00000000-0000-4000-8000-000000000101"],
    });
    await harness.sql`UPDATE user_document_outbox SET rebuild_requests='[{"targetId":1,"version":"1"}]'
      WHERE id='00000000-0000-4000-8000-000000000101'`;
    await harness.sql`UPDATE user_document_rebuild_state SET processed_at=NULL,post_publication_completed_at=NULL`;
    const damagedReceipts = await gate.verify({ batchSize: 1 });
    expect(damagedReceipts.failures).toEqual(
      expect.arrayContaining([
        { code: "invalid-rebuild-receipt", count: 1, samples: ["user:1"] },
        { code: "invalid-post-publication-receipt", count: 1, samples: ["user:1"] },
      ]),
    );
  });

  test("the complete gate shares one read-only snapshot across source, documents, work and authoritative rebuild", async () => {
    const projection = createCurrentUserDocumentProjectionBundle();
    const candidate = await projection
      .createBuilder({ db: harness.db, clock: { nowDate: () => OBSERVED_AT }, batchSize: 1 })
      .buildOne({ userId: 1, sourceVersion: "1" });
    if (!candidate) throw new Error("Fixture user was not built");
    await projection.createRowRepository(harness.db).upsert(candidate);
    await harness.sql`INSERT INTO user_document_rebuild_state
      (user_id,version,status,processed_at,post_publication_version,post_publication_status,post_publication_completed_at)
      VALUES (1,1,'processed',NOW(),1,'processed',NOW())`;
    await harness.sql`INSERT INTO user_document_outbox (id,source,status,processed_at,rebuild_requests)
      VALUES ('00000000-0000-4000-8000-000000000101',
      '{"change":{"kind":"user","userId":1}}','processed',NOW(),'[{"targetId":1,"version":"1"}]')`;
    const gate = createCurrentUserDocumentPostgresReadiness({
      db: harness.db,
      clock: { nowDate: () => OBSERVED_AT },
      config: { buildBatchSize: 1 },
    });
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const writer = harness.sql.begin(async (tx) => {
      await tx`LOCK TABLE user_document_rebuild_state IN ACCESS EXCLUSIVE MODE`;
      locked.resolve();
      await release.promise;
      await tx`UPDATE "user" SET is_delete=true WHERE id=1`;
      await tx`UPDATE user_document SET document=NULL,source_version=2 WHERE user_id=1`;
      await tx`UPDATE user_document_rebuild_state SET version=2,post_publication_version=2 WHERE user_id=1`;
      await tx`UPDATE user_document_outbox SET rebuild_requests='[{"targetId":1,"version":"2"}]'`;
    });
    await locked.promise;
    const verifying = gate.verify({ batchSize: 1 });
    try {
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline) {
        const locks = await harness.sql`SELECT pid FROM pg_locks
          WHERE relation='user_document_rebuild_state'::regclass AND NOT granted`;
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
    const after = await gate.verify({ batchSize: 1 });
    expect(during).toMatchObject({ status: "passed", counts: { deletedUsers: 0, tombstones: 0 }, failures: [] });
    expect(after).toMatchObject({ status: "passed", counts: { deletedUsers: 1, tombstones: 1 }, failures: [] });
  }, 10_000);

  test("equal-sized orphan stock cannot hide a missing source document or rebuild state", async () => {
    const projection = createCurrentUserDocumentProjectionBundle();
    const candidate = await projection
      .createBuilder({ db: harness.db, clock: { nowDate: () => OBSERVED_AT }, batchSize: 1 })
      .buildOne({ userId: 1, sourceVersion: "1" });
    if (!candidate) throw new Error("Fixture user was not built");
    await projection.createRowRepository(harness.db).upsert({ ...candidate, userId: 999 });
    await harness.sql`INSERT INTO user_document_rebuild_state
      (user_id,version,status,processed_at,post_publication_version,post_publication_status,post_publication_completed_at)
      VALUES (999,1,'processed',NOW(),1,'processed',NOW())`;
    await harness.sql`INSERT INTO user_document_outbox (id,source,status,processed_at,rebuild_requests)
      VALUES ('00000000-0000-4000-8000-000000000101',
        '{"change":{"kind":"user","userId":999}}','processed',NOW(),'[{"targetId":999,"version":"1"}]')`;
    const gate = createCurrentUserDocumentPostgresReadiness({
      db: harness.db,
      clock: { nowDate: () => OBSERVED_AT },
      config: { buildBatchSize: 1 },
    });
    const report = await gate.verify({ batchSize: 1 });
    expect(report.status).toBe("failed");
    expect(report.counts).toMatchObject({ users: 1, documents: 1, verifiedUsers: 1, rebuildStates: 1, outbox: 1 });
    expect(report.failures.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "orphan-document",
        "orphan-rebuild-state",
        "orphan-outbox",
        "missing-rebuild-state",
        "document-missing",
      ]),
    );
  });

  test("passes only for complete, strict, fresh and authoritative current inventory", async () => {
    const projection = createCurrentUserDocumentProjectionBundle();
    const builder = projection.createBuilder({
      db: harness.db as typeof database,
      clock: { nowDate: () => OBSERVED_AT },
      batchSize: 10,
    });
    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    expect(candidate).not.toBeNull();
    await harness.sql`
      INSERT INTO user_document_rebuild_state (
        user_id,
        version,
        status,
        reason_codes,
        dirty_at,
        processed_at,
        updated_at
      )
      VALUES (
        1,
        1,
        ${UserDocumentWorkStatus.Processed},
        ${JSON.stringify([UserDocumentRebuildReason.Backfill])}::jsonb,
        ${OBSERVED_AT.toISOString()},
        ${OBSERVED_AT.toISOString()},
        ${OBSERVED_AT.toISOString()}
      )
    `;
    await projection.createRowRepository(harness.db as typeof database).upsert(candidate!);
    await harness.sql`UPDATE user_document_rebuild_state SET post_publication_version=version, post_publication_status='processed', post_publication_completed_at=NOW()`;

    const repository = createUserDocumentReadinessRepository(harness.db as typeof database, {
      projection,
      buildBatchSize: 10,
    });
    const gate = createUserDocumentPostgresGate({
      schemaVersion: projection.schemaVersion,
      repository,
      clock: { nowDate: () => OBSERVED_AT },
    });

    const passedReport = await gate.verify({ batchSize: 10 });
    expect(passedReport).toMatchObject({
      version: USER_DOCUMENT_SCHEMA_VERSION,
      status: "passed",
      counts: { users: 1, documents: 1, verifiedUsers: 1 },
      failures: [],
    });

    await harness.sql`
      UPDATE user_document
      SET schema_version = 3
      WHERE user_id = 1
    `;
    const oldVersionReport = await gate.verify({ batchSize: 10 });
    expect(oldVersionReport).toMatchObject({
      status: "failed",
      failures: [{ code: "document-version-mismatch", count: 1 }],
    });

    await harness.sql`
      UPDATE user_document
      SET schema_version = ${USER_DOCUMENT_SCHEMA_VERSION},
          document = '{}'::jsonb
      WHERE user_id = 1
    `;
    const invalidReport = await gate.verify({ batchSize: 10 });
    expect(invalidReport).toMatchObject({
      status: "failed",
      failures: [{ code: "document-invalid", count: 1 }],
    });

    await projection.createRowRepository(harness.db as typeof database).upsert(candidate!);
    await harness.sql`
      UPDATE user_document_rebuild_state
      SET status = ${UserDocumentWorkStatus.Failed}
      WHERE user_id = 1
    `;
    const unconvergedReport = await gate.verify({ batchSize: 10 });
    expect(unconvergedReport).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining([
        expect.objectContaining({ code: "document-not-current", count: 1 }),
        expect.objectContaining({ code: "unprocessed-rebuild-state", count: 1 }),
      ]),
    });

    await harness.sql`DELETE FROM user_document WHERE user_id = 1`;
    const missingReport = await gate.verify({ batchSize: 10 });
    expect(missingReport).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining([
        expect.objectContaining({ code: "document-count-mismatch" }),
        expect.objectContaining({ code: "document-missing" }),
      ]),
    });
  }, 60_000);
});
