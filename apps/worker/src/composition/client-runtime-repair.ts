import type { ClientRuntimeMaintenanceCommandEnv } from "@worker/env";
import type { WorkerLogger } from "./runtime";
import {
  createClientRuntimeSnapshotLoggerObservability,
  createClientRuntimeSnapshotMaintenance,
  createClientRuntimeSnapshotRestoreRepair,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientRuntimeRestoreInventoryRepairer,
} from "@iam/api-core/client-runtime-snapshot/redis-maintenance";
import { createClientRuntimeRepairCommandRedis } from "./client-runtime-command-redis";

export function createClientRuntimeRepairCommandComposition(options: {
  env: ClientRuntimeMaintenanceCommandEnv;
  logger: WorkerLogger;
}) {
  const redis = createClientRuntimeRepairCommandRedis({
    config: options.env.redis,
    logger: options.logger,
  });
  const observability = createClientRuntimeSnapshotLoggerObservability(options.logger);
  const targeted = createClientRuntimeSnapshotMaintenance({
    redis: redis.redis,
    observability,
  });
  const restore = createClientRuntimeSnapshotRestoreRepair({
    inventory: createClientRuntimeRestoreInventoryRepairer(redis.redis),
    observability,
  });
  const maintenance = {
    ...targeted,
    ...restore,
  };

  return {
    maintenance,
    shutdown: redis.shutdown,
  };
}
