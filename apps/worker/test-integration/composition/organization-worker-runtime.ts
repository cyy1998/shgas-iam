import Redis from "ioredis";
import type { WorkerLogger } from "../../src/composition/runtime";
import { createWorkerRuntime } from "../../src/composition/runtime";
import { parseWorkerEnv } from "../../src/env";

export function createOrganizationFixtureRuntime(source: NodeJS.ProcessEnv, logger: WorkerLogger) {
  const databaseUrlBefore = process.env.DATABASE_URL;
  try {
    const env = parseWorkerEnv(source);
    // Each fixture closes only its own runtime connection; the process singleton
    // would otherwise return a connection closed by an earlier composition fixture.
    return createWorkerRuntime({ env, logger, redis: new Redis(env.redis) });
  } finally {
    // The real parser exposes DATABASE_URL for the lazy production DB import.
    // These fixtures inject their scoped DB and own only this synchronous env mutation.
    if (databaseUrlBefore === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrlBefore;
  }
}
