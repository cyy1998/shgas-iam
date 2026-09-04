import { CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS } from "./legacy-restore-cleanup-inventory";

const DEFAULT_SCAN_COUNT = 100;

export interface ClientRuntimeRestoreInventoryReader {
  readonly forEachOwnedBatch: (
    visit: (keys: readonly string[]) => void | Promise<void>,
  ) => Promise<void>;
}

export interface ClientRuntimeRestoreInventoryRepairer
  extends ClientRuntimeRestoreInventoryReader {
  readonly unlinkOwned: (keys: readonly string[]) => Promise<number>;
}

export interface ClientRuntimeRestoreScanRedis {
  readonly scan: (
    cursor: string,
    matchToken: "MATCH",
    pattern: string,
    countToken: "COUNT",
    count: string,
  ) => Promise<[string, string[]]>;
}

export interface ClientRuntimeRestoreRepairRedis extends ClientRuntimeRestoreScanRedis {
  readonly unlink: (...keys: string[]) => Promise<number>;
}

export function createClientRuntimeRestoreInventoryReader(
  redis: ClientRuntimeRestoreScanRedis,
): ClientRuntimeRestoreInventoryReader {
  return createInventoryReader(redis, DEFAULT_SCAN_COUNT);
}

export function createClientRuntimeRestoreInventoryReaderForTesting(
  redis: ClientRuntimeRestoreScanRedis,
  scanCount = DEFAULT_SCAN_COUNT,
): ClientRuntimeRestoreInventoryReader {
  return createInventoryReader(redis, scanCount);
}

function createInventoryReader(
  redis: ClientRuntimeRestoreScanRedis,
  scanCount: number,
): ClientRuntimeRestoreInventoryReader {
  requirePositiveSafeInteger(scanCount, "scanCount");
  return {
    async forEachOwnedBatch(visit) {
      for (const owner of CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS) {
        let cursor = "0";
        do {
          const result = await redis.scan(
            cursor,
            "MATCH",
            owner.pattern,
            "COUNT",
            String(scanCount),
          );
          if (!Array.isArray(result) || result.length !== 2)
            throw new Error("Invalid Client Runtime restore scan result");
          const [nextCursor, keys] = result;
          if (typeof nextCursor !== "string" || !/^\d+$/u.test(nextCursor)
            || !Array.isArray(keys) || keys.some(key => typeof key !== "string")) {
            throw new Error("Invalid Client Runtime restore scan result");
          }
          await visit(keys);
          cursor = nextCursor;
        } while (cursor !== "0");
      }
    },
  };
}

export function createClientRuntimeRestoreInventoryRepairer(
  redis: ClientRuntimeRestoreRepairRedis,
): ClientRuntimeRestoreInventoryRepairer {
  return createInventoryRepairer(redis, DEFAULT_SCAN_COUNT);
}

export function createClientRuntimeRestoreInventoryRepairerForTesting(
  redis: ClientRuntimeRestoreRepairRedis,
  scanCount = DEFAULT_SCAN_COUNT,
): ClientRuntimeRestoreInventoryRepairer {
  return createInventoryRepairer(redis, scanCount);
}

function createInventoryRepairer(
  redis: ClientRuntimeRestoreRepairRedis,
  scanCount: number,
): ClientRuntimeRestoreInventoryRepairer {
  return {
    ...createInventoryReader(redis, scanCount),
    async unlinkOwned(keys) {
      return keys.length === 0 ? 0 : await redis.unlink(...keys);
    },
  };
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive safe integer`);
}
