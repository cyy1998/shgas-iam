import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { UserStatus } from "@iam/contracts";
import { createDocumentFactsCacheRecord } from "../../../src/user/document";
import {
  createCurrentUserDocumentProjectionBundle,
  createUserDocumentRedisAccessReadinessWithProjection,
} from "../../../src/user/worker";
import { createPostgresTestHarness } from "../support/postgres-test-harness";
import { createRedisTestHarness } from "../support/redis-test-harness";

let pg: Awaited<ReturnType<typeof createPostgresTestHarness>>;
let redis: Awaited<ReturnType<typeof createRedisTestHarness>>;
beforeAll(async () => {
  pg = await createPostgresTestHarness();
  redis = await createRedisTestHarness();
});
afterAll(async () => {
  await redis?.close();
  await pg?.close();
});

test("complete Redis verification includes every status and deletion tombstone, detects missing stock and never repairs it", async () => {
  const scope = await redis.createScope();
  const subjects = Array.from({ length: 5 }, () => randomUUID());
  const statuses = [UserStatus.Enable, UserStatus.Pause, UserStatus.Disable, UserStatus.Disable, UserStatus.Enable];
  for (const [index, subject] of subjects.entries()) {
    await pg.sql`INSERT INTO "user" (id,subject_identifier,username,name,status,is_delete)
      VALUES (${index + 1},${subject},${`verify-${index}`},${`User ${index}`},${statuses[index]!},${index === 3})`;
  }
  const projection = createCurrentUserDocumentProjectionBundle();
  const publications = await projection
    .createBuilder({ db: pg.db, clock: { nowDate: () => new Date() }, batchSize: 1 })
    .buildMany(subjects.map((_subject, index) => ({ userId: index + 1, sourceVersion: "1" })));
  expect(publications).toHaveLength(5);
  for (const document of publications) {
    await projection.createRowRepository(pg.db).upsert(document);
    await scope.firstFactsPublisher.publish(createDocumentFactsCacheRecord(document));
  }
  await pg.sql`INSERT INTO user_document_rebuild_state
    (user_id,version,status,processed_at,post_publication_version,post_publication_status,post_publication_completed_at)
    SELECT id,1,'processed',NOW(),1,'processed',NOW() FROM "user"`;
  // Deliberately wrong only for the deleted source. It must still be inspected.
  await scope.subjectAccessBootstrap.seedMany(
    subjects.map((subjectIdentifier, index) => ({
      subjectIdentifier,
      state: index === 0 || index === 3 || index === 4 ? ("enabled" as const) : ("disabled" as const),
    })),
    new Date(),
  );
  const gate = createUserDocumentRedisAccessReadinessWithProjection({
    db: pg.db,
    subjectFactsRedis: scope.projectionRedis.inspector,
    subjectAccessBootstrap: scope.subjectAccessBootstrap,
    projection: {
      ...projection,
      subjectFacts: { ...projection.subjectFacts, createInspector: () => scope.factsInspector },
    },
    clock: { nowDate: () => new Date() },
    config: { buildBatchSize: 1 },
  });
  const wrongBarrier = await gate.verify({ batchSize: 1 });
  expect(wrongBarrier.counts).toMatchObject({
    users: 5,
    documents: 5,
    verifiedUsers: 5,
    deletedUsers: 1,
    tombstones: 1,
  });
  expect(wrongBarrier.failures).toContainEqual({ code: "barrier-state-mismatch", count: 1, samples: ["user:4"] });
  const transition = await scope.subjectAccessBarrier.beginBlocking(subjects[3]!);
  await scope.subjectAccessBarrier.prepareRepair(transition, "disabled");
  await scope.subjectAccessBarrier.finalize(transition, "disabled");
  const complete = await gate.verify({ batchSize: 1 });
  expect(complete.status).toBe("passed");

  await scope.clearPublishedUserDocumentRecord(subjects[3]!);
  const missingBefore = await scope.readPublishedUserDocumentRecord(subjects[3]!);
  const missingTombstone = await gate.verify({ batchSize: 1 });
  const missingAfter = await scope.readPublishedUserDocumentRecord(subjects[3]!);
  expect(missingTombstone.failures).toContainEqual({ code: "facts-missing", count: 1, samples: ["user:4"] });
  expect(missingBefore).toBeNull();
  expect(missingAfter).toBeNull();
  const deleted = publications.find(({ userId }) => userId === 4);
  if (!deleted) throw new Error("Full build omitted deleted user");
  await scope.firstFactsPublisher.publish(createDocumentFactsCacheRecord(deleted));
  await pg.sql`DELETE FROM user_document WHERE user_id=4`;
  const missingDocument = await gate.verify({ batchSize: 1 });
  expect(missingDocument.status).toBe("failed");
  expect(missingDocument.failures).toContainEqual({
    code: "facts-without-current-document",
    count: 1,
    samples: ["user:4"],
  });
  await projection.createRowRepository(pg.db).upsert(deleted);
  const restored = await gate.verify({ batchSize: 1 });
  expect(restored.status).toBe("passed");
}, 30_000);
