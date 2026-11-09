import { randomUUID } from "node:crypto";
import type { SubjectAccessBarrier } from "@iam/subject-access";
import { createSubjectAccessBarrier } from "@iam/subject-access";
import type { SubjectAccessBootstrap } from "@iam/subject-access/redis";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import type { createExclusiveRedisTestHarness } from "@iam/test-support/external-test-resources";
import type Redis from "ioredis";

export interface SubjectAccessRedisTestScope {
  readonly bootstrap: SubjectAccessBootstrap;
  readonly writer: SubjectAccessBarrier;
  readonly observer: SubjectAccessBarrier;
  readonly writerBacklog: Pick<
    ReturnType<typeof createRedisSubjectAccessStore>,
    | "claimRepairSubject"
    | "finalize"
    | "finalizeRepairSubject"
    | "inspectRepairBacklog"
    | "prepareRepair"
    | "rescheduleRepairSubject"
  >;
  readonly observerBacklog: Pick<
    ReturnType<typeof createRedisSubjectAccessStore>,
    | "claimRepairSubject"
    | "finalize"
    | "finalizeRepairSubject"
    | "inspectRepairBacklog"
    | "prepareRepair"
    | "rescheduleRepairSubject"
  >;
  readonly seedRepairIndex: (subjectIdentifiers: readonly string[], score?: number) => Promise<void>;
  readonly seedRepairAgeIndex: (subjectIdentifiers: readonly string[], score?: number) => Promise<void>;
  readonly removeRepairAgeEntry: (subjectIdentifier: string) => Promise<void>;
  readonly seedRecord: (subjectIdentifier: string, serializedRecord: string) => Promise<void>;
}

export async function createSubjectAccessRedisTestScope(
  harness: ReturnType<typeof createExclusiveRedisTestHarness>,
  input: { writerTransitionIds: readonly string[]; observerTransitionIds: readonly string[] },
): Promise<SubjectAccessRedisTestScope> {
  const keyPrefix = `iam:test:subject-access:${randomUUID()}:`;
  const { first: writerRedis, second: observerRedis } = await harness.openPair();

  const writerClient = createSubjectAccessClient({
    keyPrefix,
    redis: writerRedis,
    transitionIds: input.writerTransitionIds,
  });
  const observerClient = createSubjectAccessClient({
    keyPrefix,
    redis: observerRedis,
    transitionIds: input.observerTransitionIds,
  });
  return {
    bootstrap: createSubjectAccessBootstrap({
      keyPrefix,
      random: { uuid: randomUUID },
      redis: writerRedis,
    }),
    observer: observerClient.barrier,
    observerBacklog: observerClient.backlog,
    async seedRepairIndex(subjectIdentifiers, score = 0) {
      if (subjectIdentifiers.length === 0) return;
      await writerRedis.zadd(`${keyPrefix}idx:repair`, ...subjectIdentifiers.flatMap((subject) => [score, subject]));
    },
    async seedRepairAgeIndex(subjectIdentifiers, score = 0) {
      if (subjectIdentifiers.length === 0) return;
      await writerRedis.zadd(
        `${keyPrefix}idx:repair:age`,
        ...subjectIdentifiers.flatMap((subject) => [score, subject]),
      );
    },
    async removeRepairAgeEntry(subjectIdentifier) {
      await writerRedis.zrem(`${keyPrefix}idx:repair:age`, subjectIdentifier);
    },
    async seedRecord(subjectIdentifier, serializedRecord) {
      await writerRedis.set(`${keyPrefix}record:${subjectIdentifier}`, serializedRecord);
    },
    writer: writerClient.barrier,
    writerBacklog: writerClient.backlog,
  };
}

function createSubjectAccessClient(input: { keyPrefix: string; redis: Redis; transitionIds: readonly string[] }) {
  let transitionIdIndex = 0;
  const backlog = createRedisSubjectAccessStore({
    keyPrefix: input.keyPrefix,
    redis: input.redis,
  });
  const barrier = createSubjectAccessBarrier({
    clock: { nowDate: () => new Date() },
    random: {
      uuid() {
        const transitionId = input.transitionIds[transitionIdIndex];
        if (transitionId === undefined) throw new Error("Subject Access Redis test transition ID fixture exhausted");
        transitionIdIndex += 1;
        return transitionId;
      },
    },
    store: backlog,
  });
  return { backlog, barrier };
}
