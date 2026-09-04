import type { ClientRuntimeSnapshotAtomicStore } from "./atomic-store";
import type { ClientRuntimeSnapshotObservabilityPort } from "./observability";
import type { ClientRuntimeSnapshotRedis } from "./redis-store";
import type {
  ClientRuntimeRestoreInventoryReader,
  ClientRuntimeRestoreInventoryRepairer,
} from "./restore-inventory";
import { randomUUID } from "node:crypto";
import {
  ClientRuntimeRepairFailedError,
  ClientRuntimeVerifyFailedError,
} from "./contract";
import { createClientRuntimeSnapshotRedisStore } from "./redis-store";

const DEFAULT_UNLINK_BATCH_SIZE = 100;
const DEFAULT_MAX_REPAIR_PASSES = 100;

export interface ClientRuntimeSnapshotTargetedMaintenance {
  readonly repairClient: (clientCode: string) => Promise<void>;
}

export interface ClientRuntimeSnapshotRestoreRepair {
  readonly repairAllAfterRedisRestore: (
    confirmation: ClientRuntimeRestoreConfirmation,
  ) => Promise<ClientRuntimeRestoreRepairResult>;
}

export interface ClientRuntimeSnapshotVerifier {
  readonly verifyAllAfterRedisRestore: (
    confirmation: ClientRuntimeRestoreConfirmation,
  ) => Promise<ClientRuntimeRestoreVerifyResult>;
}

export interface ClientRuntimeRestoreConfirmation {
  readonly protocolTrafficStopped: true;
}

export interface ClientRuntimeRestoreRepairResult {
  readonly scannedKeys: number;
  readonly unlinkedKeys: number;
  readonly unlinkBatches: number;
}

export interface ClientRuntimeRestoreVerifyResult {
  readonly matchingKeys: number;
}

export interface CreateClientRuntimeSnapshotMaintenanceOptions {
  readonly redis: ClientRuntimeSnapshotRedis;
  readonly createEpoch?: () => string;
  readonly now?: () => number;
  readonly observability?: ClientRuntimeSnapshotObservabilityPort;
}

export interface CreateClientRuntimeSnapshotMaintenanceWithAtomicStoreOptions
  extends Omit<CreateClientRuntimeSnapshotMaintenanceOptions, "redis"> {
  readonly store: ClientRuntimeSnapshotAtomicStore;
}

interface CreateRestoreRepairWithInventoryOptions {
  readonly inventory: ClientRuntimeRestoreInventoryRepairer;
  readonly maxRepairPasses?: number;
  readonly now?: () => number;
  readonly observability?: ClientRuntimeSnapshotObservabilityPort;
  readonly unlinkBatchSize?: number;
}

interface CreateVerifierWithInventoryOptions {
  readonly inventory: ClientRuntimeRestoreInventoryReader;
  readonly now?: () => number;
  readonly observability?: ClientRuntimeSnapshotObservabilityPort;
}

export function createClientRuntimeSnapshotMaintenance(
  options: CreateClientRuntimeSnapshotMaintenanceOptions,
): ClientRuntimeSnapshotTargetedMaintenance {
  return createClientRuntimeSnapshotMaintenanceWithAtomicStore({
    ...options,
    store: createClientRuntimeSnapshotRedisStore(options.redis),
  });
}

export function createClientRuntimeSnapshotRestoreRepair(options: {
  readonly inventory: ClientRuntimeRestoreInventoryRepairer;
  readonly now?: () => number;
  readonly observability?: ClientRuntimeSnapshotObservabilityPort;
}): ClientRuntimeSnapshotRestoreRepair {
  return createClientRuntimeSnapshotRestoreRepairWithInventory({
    inventory: options.inventory,
    now: options.now,
    observability: options.observability,
  });
}

export function createClientRuntimeSnapshotVerifier(options: {
  readonly inventory: ClientRuntimeRestoreInventoryReader;
  readonly now?: () => number;
  readonly observability?: ClientRuntimeSnapshotObservabilityPort;
}): ClientRuntimeSnapshotVerifier {
  return createClientRuntimeSnapshotVerifierWithInventory({
    inventory: options.inventory,
    now: options.now,
    observability: options.observability,
  });
}

export function createClientRuntimeSnapshotRestoreRepairWithInventory(
  options: CreateRestoreRepairWithInventoryOptions,
): ClientRuntimeSnapshotRestoreRepair {
  const now = options.now ?? Date.now;
  const unlinkBatchSize = options.unlinkBatchSize ?? DEFAULT_UNLINK_BATCH_SIZE;
  const maxRepairPasses = options.maxRepairPasses ?? DEFAULT_MAX_REPAIR_PASSES;
  requirePositiveSafeInteger(unlinkBatchSize, "unlinkBatchSize");
  requirePositiveSafeInteger(maxRepairPasses, "maxRepairPasses");

  return {
    async repairAllAfterRedisRestore(confirmation) {
      const startedAt = now();
      let outcome: "completed" | "failed" = "failed";
      let scannedKeys = 0;
      let unlinkedKeys = 0;
      let unlinkBatches = 0;
      try {
        requireTrafficStopped(confirmation);
        let converged = false;
        for (let pass = 0; pass < maxRepairPasses; pass += 1) {
          let passScannedKeys = 0;
          let passUnlinkedKeys = 0;
          await options.inventory.forEachOwnedBatch(async (keys) => {
            scannedKeys = safeAdd(scannedKeys, keys.length);
            passScannedKeys = safeAdd(passScannedKeys, keys.length);
            for (let start = 0; start < keys.length; start += unlinkBatchSize) {
              const batch = keys.slice(start, start + unlinkBatchSize);
              const unlinked = await options.inventory.unlinkOwned(batch);
              if (!Number.isSafeInteger(unlinked) || unlinked < 0 || unlinked > batch.length)
                throw new Error("Invalid Client Runtime restore unlink result");
              unlinkedKeys = safeAdd(unlinkedKeys, unlinked);
              passUnlinkedKeys = safeAdd(passUnlinkedKeys, unlinked);
              unlinkBatches = safeAdd(unlinkBatches, 1);
            }
          });
          if (passScannedKeys === 0) {
            converged = true;
            break;
          }
          if (passUnlinkedKeys === 0)
            throw new Error("Client Runtime restore repair made no progress");
        }
        if (!converged)
          throw new Error("Client Runtime restore repair did not converge");
        outcome = "completed";
        return { scannedKeys, unlinkedKeys, unlinkBatches };
      }
      catch {
        throw new ClientRuntimeRepairFailedError();
      }
      finally {
        observe(options.observability, {
          operation: "repair-all",
          outcome,
          durationMs: elapsed(now, startedAt),
        });
      }
    },
  };
}

export function createClientRuntimeSnapshotVerifierWithInventory(
  options: CreateVerifierWithInventoryOptions,
): ClientRuntimeSnapshotVerifier {
  const now = options.now ?? Date.now;
  return {
    async verifyAllAfterRedisRestore(confirmation) {
      const startedAt = now();
      let outcome: "completed" | "failed" = "failed";
      let matchingKeys = 0;
      try {
        requireTrafficStopped(confirmation);
        await options.inventory.forEachOwnedBatch((keys) => {
          matchingKeys = safeAdd(matchingKeys, keys.length);
        });
        outcome = "completed";
        return { matchingKeys };
      }
      catch {
        throw new ClientRuntimeVerifyFailedError();
      }
      finally {
        observe(options.observability, {
          operation: "verify-all",
          outcome,
          durationMs: elapsed(now, startedAt),
        });
      }
    },
  };
}

export function createClientRuntimeSnapshotMaintenanceWithAtomicStore(
  options: CreateClientRuntimeSnapshotMaintenanceWithAtomicStoreOptions,
): ClientRuntimeSnapshotTargetedMaintenance {
  const createEpoch = options.createEpoch ?? randomUUID;
  const now = options.now ?? Date.now;

  return {
    async repairClient(clientCode: string) {
      const startedAt = now();
      let outcome: "completed" | "failed" = "failed";
      try {
        await options.store.invalidateClient(clientCode, createEpoch());
        outcome = "completed";
      }
      catch {
        throw new ClientRuntimeRepairFailedError();
      }
      finally {
        observe(options.observability, {
          operation: "repair-client",
          outcome,
          durationMs: elapsed(now, startedAt),
          clientCode,
        });
      }
    },
  };
}

function requireTrafficStopped(confirmation: ClientRuntimeRestoreConfirmation) {
  if (confirmation?.protocolTrafficStopped !== true)
    throw new Error("Protocol traffic stop confirmation is required");
}

function observe(
  observability: ClientRuntimeSnapshotObservabilityPort | undefined,
  observation: Parameters<ClientRuntimeSnapshotObservabilityPort["record"]>[0],
) {
  try {
    observability?.record(observation);
  }
  catch {}
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive safe integer`);
}

function safeAdd(current: number, increment: number) {
  const next = current + increment;
  if (!Number.isSafeInteger(next))
    throw new Error("Client Runtime maintenance diagnostic count exceeded safe integer range");
  return next;
}

function elapsed(now: () => number, startedAt: number) {
  const duration = now() - startedAt;
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}
