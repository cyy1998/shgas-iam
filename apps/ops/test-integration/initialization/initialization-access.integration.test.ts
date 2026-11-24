import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { UserDocumentWorkStatus } from "@iam/contracts";
import { userDocumentRebuildStates } from "@iam/db/schema";
import { DocumentFactsCacheRecordSchema } from "@iam/documents/user/subject-facts";
import { createCurrentUserDocumentProjectionBundle } from "@iam/documents/user/worker";
import { SubjectAccessRecordSchema } from "@iam/subject-access";
import { SUBJECT_ACCESS_REDIS_KEY_PREFIX } from "@iam/subject-access/redis";

import { initializeSourceFacts } from "../../src/commands/initialization/initialization-source";
import { completePublishedInitializationAccess } from "../../src/composition/initialization-access";
import { createOpsSubjectAccess } from "../../src/composition/subject-access";
import { createOpsPostgresTestHarness } from "../support/postgres-test-harness";
import { createOpsRedisTestHarness } from "../support/redis-test-harness";
import { fixtureInput } from "./fixtures";

let pg: Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;
let redis: Awaited<ReturnType<typeof createOpsRedisTestHarness>> | undefined;
let source: Awaited<ReturnType<typeof initializeSourceFacts>>;
let factsKey: string;
let barrierKey: string;
const clock = { now: Date.now, nowDate: () => new Date() };
const projection = createCurrentUserDocumentProjectionBundle();

beforeAll(async () => {
  pg = await createOpsPostgresTestHarness();
});
afterAll(async () => {
  await pg?.close();
});
beforeEach(async () => {
  await pg.reset();
  redis = await createOpsRedisTestHarness();
  const { input, secrets } = fixtureInput();
  source = await initializeSourceFacts(pg.db, input, secrets);
  factsKey = `user-document:subject-facts:${source.subjectIdentifier}`;
  barrierKey = `${SUBJECT_ACCESS_REDIS_KEY_PREFIX}record:${source.subjectIdentifier}`;
});

afterEach(async () => {
  try {
    if (redis && factsKey && barrierKey) await redis.writer.del(factsKey, barrierKey);
  } finally {
    try {
      await redis?.close();
    } finally {
      redis = undefined;
      factsKey = "";
      barrierKey = "";
    }
  }
});

function completeAccess() {
  return completePublishedInitializationAccess({
    db: pg.db,
    runtime: { redis: redis!.writer, clock },
    source,
    username: fixtureInput().input.admin.username,
    config: { buildBatchSize: 10, batchSize: 10 },
  });
}

async function expectPending(code: string, preservedBarrier: string | null = null) {
  let error: unknown;
  try {
    await completeAccess();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(code);
  const observed = await redis!.observer.get(barrierKey);
  expect(observed).toBe(preservedBarrier);
}

async function publish(version = "1", publishRedis = true) {
  const { db } = pg!;
  const publishedAt = clock.nowDate();
  const document = await projection.createBuilder({ db, clock, batchSize: 10 }).buildOne({
    userId: source.userId,
    sourceVersion: version,
  });
  if (!document) throw new Error("Initialization fixture failed to build the User Document");
  await db.transaction(async (tx) => {
    await projection.createRowRepository(tx).upsert(document);
    const receipt = {
      version,
      status: UserDocumentWorkStatus.Processed,
      processedAt: publishedAt,
      postPublicationVersion: version,
      postPublicationStatus: "processed" as const,
      postPublicationCompletedAt: publishedAt,
    };
    await tx
      .insert(userDocumentRebuildStates)
      .values({
        userId: source.userId,
        ...receipt,
      })
      .onConflictDoUpdate({
        target: userDocumentRebuildStates.userId,
        set: receipt,
      });
  });
  const record = projection.subjectFacts.createRecord(document);
  if (record.kind !== "document") throw new Error("Initialization fixture produced a tombstone");
  if (publishRedis) {
    await projection.subjectFacts.createPublisher(redis!.writer).publish(record);
    const [facts] = await projection.subjectFacts
      .createInspector(redis!.observer)
      .inspectMany([source.subjectIdentifier]);
    expect(facts).toEqual({ status: "valid", record });
  }
  return record;
}

test("源事实未完成 PG publication 时不种 Barrier", async () => {
  await expectPending("initialization-postgres-publication-pending");
});

test("PG 已发布但 Redis Facts 缺失时不种 Barrier", async () => {
  await publish("1", false);
  await expectPending("initialization-redis-facts-pending");
});

test("PG 新版本与旧 Redis Facts 不一致时保留已有 Barrier 代际", async () => {
  await publish();
  const { bootstrap } = createOpsSubjectAccess({ redis: redis!.writer, clock });
  await bootstrap.seedMany([{ subjectIdentifier: source.subjectIdentifier, state: "enabled" }], clock.nowDate());
  const before = await redis!.observer.get(barrierKey);
  await publish("2", false);
  await expectPending("initialization-redis-facts-pending", before);
});

test("同版本但内容不同的 strict-valid Facts 也不能种 Barrier", async () => {
  const record = await publish();
  await redis!.writer.set(
    factsKey,
    JSON.stringify({ ...record, facts: { ...record.facts, profile: { ...record.facts.profile, name: "不一致" } } }),
  );
  const [facts] = await projection.subjectFacts
    .createInspector(redis!.observer)
    .inspectMany([source.subjectIdentifier]);
  expect(facts?.status).toBe("valid");
  await expectPending("initialization-redis-facts-pending");
});

test("Facts 自有键真实到期后拒绝初始化，未增加按 publishedAt 年龄失效规则", async () => {
  await publish();
  const assigned = await redis!.writer.pexpire(factsKey, 1);
  expect(assigned).toBe(1);
  await Bun.sleep(10);
  const missing = await redis!.observer.get(factsKey);
  expect(missing).toBeNull();
  await expectPending("initialization-redis-facts-pending");
});

test("完整 publication 后种缺失 Barrier，重复执行保留 PG/Facts/Barrier 字节和代际", async () => {
  await publish();
  const initialFacts = await redis!.observer.get(factsKey);
  const expectedEmployments = [
    {
      isPrimary: true,
      organization: {
        code: "controlled-root",
        name: "受控组织",
        type: "虚拟组织",
        path: [{ code: "controlled-root", name: "受控组织", type: "虚拟组织" }],
      },
      position: { code: "controlled-operator", name: "受控维护岗位" },
      responsibilities: [],
      clientAuthorizations: [{ clientCode: "iam-admin", roles: [{ code: "iam:admin" }] }],
    },
  ];
  const [publication] = await pg.sql`select document from user_document where user_id=${source.userId}`;
  expect(publication?.document).toMatchObject({
    username: "controlled-admin",
    name: "受控管理员",
    employments: expectedEmployments,
  });
  const facts = DocumentFactsCacheRecordSchema.parse(JSON.parse(initialFacts!));
  expect(facts).toMatchObject({
    kind: "document",
    facts: { profile: { username: "controlled-admin", name: "受控管理员" }, employments: expectedEmployments },
  });

  const [initialProfile] = await pg.sql`select to_jsonb(p) as row from user_document p where user_id=${source.userId}`;
  const first = await completeAccess();
  expect(first).toEqual({ seeded: 1, retainedExisting: 0 });
  const initialBarrier = await redis!.observer.get(barrierKey);
  const { bootstrap } = createOpsSubjectAccess({ redis: redis!.writer, clock });
  const inspected = await bootstrap.inspectMany([source.subjectIdentifier]);
  expect(inspected[0]).toMatchObject({
    status: "valid",
    record: { subjectIdentifier: source.subjectIdentifier, state: "enabled" },
  });
  const repeated = await completeAccess();
  expect(repeated).toEqual({ seeded: 0, retainedExisting: 1 });
  const repeatedFacts = await redis!.observer.get(factsKey);
  const repeatedBarrier = await redis!.observer.get(barrierKey);
  const [repeatedProfile] = await pg!
    .sql`select to_jsonb(p) as row from user_document p where user_id=${source.userId}`;
  expect(repeatedFacts).toBe(initialFacts);
  expect(repeatedBarrier).toBe(initialBarrier);
  expect(repeatedProfile).toEqual(initialProfile);
});

test("已有 enabled Barrier 的原 transitionId/updatedAt 保持原样", async () => {
  await publish();
  const { bootstrap } = createOpsSubjectAccess({ redis: redis!.writer, clock });
  await bootstrap.seedMany(
    [{ subjectIdentifier: source.subjectIdentifier, state: "enabled" }],
    new Date("2026-08-01T00:00:00Z"),
  );
  const before = await redis!.observer.get(barrierKey);
  const result = await completeAccess();
  expect(result).toEqual({ seeded: 0, retainedExisting: 1 });
  const after = await redis!.observer.get(barrierKey);
  expect(after).toBe(before);
});

for (const state of ["disabled", "blocking", "invalid"] as const) {
  test(`已有 ${state} Barrier 不被初始化覆盖为 enabled`, async () => {
    await publish();
    const serialized =
      state === "invalid"
        ? "invalid-owned-record"
        : JSON.stringify(
            SubjectAccessRecordSchema.parse({
              version: 1,
              subjectIdentifier: source.subjectIdentifier,
              state,
              transitionId: randomUUID(),
              updatedAt: "2026-08-01T00:00:00.000Z",
            }),
          );
    await redis!.writer.set(barrierKey, serialized);
    await expectPending("initialization-access-not-verified", serialized);
  });
}
