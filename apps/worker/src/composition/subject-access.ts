import { randomUUID } from "node:crypto";
import { createSubjectAccessBarrier } from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import type { WorkerRuntime } from "./runtime";

export function createWorkerSubjectAccess(runtime: Pick<WorkerRuntime, "clock" | "redis">) {
  const store = createRedisSubjectAccessStore({
    redis: runtime.redis,
  });
  const barrier = createSubjectAccessBarrier({
    clock: runtime.clock,
    random: { uuid: randomUUID },
    store,
  });
  const bootstrap = createSubjectAccessBootstrap({
    redis: runtime.redis,
    random: { uuid: randomUUID },
  });
  return { barrier, bootstrap, store };
}
