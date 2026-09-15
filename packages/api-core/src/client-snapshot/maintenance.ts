import type { ClientSnapshotRedis } from "./contract";
import { randomUUID } from "node:crypto";
import { ClientCodeSchema } from "@iam/contracts";
import { ClientSnapshotInvalidationError, ClientSnapshotUnavailableError } from "./contract";
import { createClientSnapshotRedisStore } from "./redis-store";

interface ClientRuntimeRestoreScanRedis {
  scan: (cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: string) => Promise<[
    string,
    string[],
  ]>;
}
interface ClientRuntimeRestoreRepairRedis extends ClientRuntimeRestoreScanRedis {
  unlink: (...keys: string[]) => Promise<number>;
}
interface Confirmation {
  protocolTrafficStopped: true;
}
function requireStopped(confirmation: Confirmation) {
  if (confirmation?.protocolTrafficStopped !== true)
    throw new Error("Protocol traffic stop confirmation is required");
}
function add(current: number, increment: number) {
  const next = current + increment;
  if (!Number.isSafeInteger(next))
    throw new Error("Snapshot maintenance count exceeded budget");
  return next;
}
export const CLIENT_SNAPSHOT_INVENTORY = [
  "client-snapshot:v1:{*}:control",
  "client-snapshot:v1:{*}:payload:client",
  "client-snapshot:v1:{*}:payload:credential",
] as const;
function inventory(redis: ClientRuntimeRestoreScanRedis) {
  return {
    async forEachOwnedBatch(visit: (keys: readonly string[]) => void | Promise<void>) {
      for (const pattern of CLIENT_SNAPSHOT_INVENTORY) {
        let cursor = "0";
        do {
          const result = await redis.scan(cursor, "MATCH", pattern, "COUNT", "100");
          if (!Array.isArray(result)
            || result.length !== 2
            || !/^\d+$/u.test(result[0])
            || !Array.isArray(result[1])
            || result[1].some(key => typeof key !== "string")) {
            throw new Error("Invalid Snapshot inventory");
          }
          cursor = result[0];
          await visit(result[1]);
        } while (cursor !== "0");
      }
    },
  };
}
export function createClientSnapshotVerifier(redis: ClientRuntimeRestoreScanRedis) {
  return { async verifyAllAfterRedisRestore(confirmation: Confirmation) {
    try {
      requireStopped(confirmation);
      let matchingKeys = 0;
      await inventory(redis).forEachOwnedBatch((keys) => {
        matchingKeys = add(matchingKeys, keys.length);
      });
      return { matchingKeys };
    }
    catch {
      throw new ClientSnapshotUnavailableError();
    }
  } };
}
export function createClientSnapshotMaintenance(redis: ClientSnapshotRedis & ClientRuntimeRestoreRepairRedis) {
  const store = createClientSnapshotRedisStore(redis);
  return {
    async repairClient(code: string) {
      ClientCodeSchema.parse(code);
      try {
        await store.invalidateClient(code, randomUUID());
      }
      catch {
        throw new ClientSnapshotInvalidationError();
      }
    },
    async repairAllAfterRedisRestore(confirmation: Confirmation) {
      try {
        requireStopped(confirmation);
        let scannedKeys = 0;
        let unlinkedKeys = 0;
        let unlinkBatches = 0;
        for (let pass = 0; pass < 100; pass++) {
          let passScanned = 0;
          let passUnlinked = 0;
          await inventory(redis).forEachOwnedBatch(async (keys) => {
            scannedKeys = add(scannedKeys, keys.length);
            passScanned = add(passScanned, keys.length);
            for (let offset = 0; offset < keys.length; offset += 100) {
              const batch = keys.slice(offset, offset + 100);
              const removed = await redis.unlink(...batch);
              if (!Number.isSafeInteger(removed) || removed < 0 || removed > batch.length)
                throw new Error("Invalid Snapshot unlink result");
              unlinkedKeys = add(unlinkedKeys, removed);
              passUnlinked = add(passUnlinked, removed);
              unlinkBatches = add(unlinkBatches, 1);
            }
          });
          if (passScanned === 0)
            return { scannedKeys, unlinkedKeys, unlinkBatches };
          if (passUnlinked === 0)
            throw new Error("Snapshot repair made no progress");
        }
        throw new Error("Snapshot repair did not converge");
      }
      catch {
        throw new ClientSnapshotInvalidationError();
      }
    },
  };
}
