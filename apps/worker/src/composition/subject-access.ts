import type { WorkerRuntime } from "./runtime";
import { randomUUID } from "node:crypto";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
} from "@iam/api-core/subject-access";

export function createWorkerSubjectAccess(
  runtime: Pick<WorkerRuntime, "clock" | "redis">,
) {
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
