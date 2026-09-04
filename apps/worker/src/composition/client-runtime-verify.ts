import type { ClientRuntimeMaintenanceCommandEnv } from "@worker/env";
import type { WorkerLogger } from "./runtime";
import {
  createClientRuntimeSnapshotLoggerObservability,
  createClientRuntimeSnapshotVerifier,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientRuntimeRestoreInventoryReader,
} from "@iam/api-core/client-runtime-snapshot/redis-maintenance";
import { createClientRuntimeVerifyCommandRedis } from "./client-runtime-command-redis";

export function createClientRuntimeVerifyCommandComposition(options: {
  env: ClientRuntimeMaintenanceCommandEnv;
  logger: WorkerLogger;
}) {
  const redis = createClientRuntimeVerifyCommandRedis({
    config: options.env.redis,
    logger: options.logger,
  });
  const verifier = createClientRuntimeSnapshotVerifier({
    inventory: createClientRuntimeRestoreInventoryReader(redis.redis),
    observability: createClientRuntimeSnapshotLoggerObservability(options.logger),
  });

  return {
    verifier,
    shutdown: redis.shutdown,
  };
}
