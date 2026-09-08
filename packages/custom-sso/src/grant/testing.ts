import type { AuthorizationGrantRedemptionScheduler } from "./authorization-grant-redemption";
import type { AuthorizationGrantRedemptionRecord } from "./model";
import type { AuthorizationGrantRedemptionStore } from "./store";

export interface CreateInMemoryAuthorizationGrantRedemptionStoreOptions {
  readonly clock?: {
    readonly now: () => number;
  };
}

export interface ManualAuthorizationGrantRedemptionScheduler {
  readonly advanceToNextHeartbeat: () => Promise<number>;
  readonly scheduler: AuthorizationGrantRedemptionScheduler;
}

export function createManualAuthorizationGrantRedemptionScheduler(): ManualAuthorizationGrantRedemptionScheduler {
  let pendingDelay: ScheduledDelay | undefined;
  let pendingDelayWaiters: Array<(delay: ScheduledDelay) => void> = [];

  function waitForPendingDelay() {
    if (pendingDelay !== undefined)
      return Promise.resolve(pendingDelay);
    return new Promise<ScheduledDelay>((resolve) => {
      pendingDelayWaiters.push(resolve);
    });
  }

  return {
    async advanceToNextHeartbeat() {
      const currentDelay = await waitForPendingDelay();
      currentDelay.complete();
      await waitForPendingDelay();
      return currentDelay.delayMs;
    },
    scheduler: {
      delay(delayMs) {
        if (pendingDelay !== undefined)
          throw new Error("Authorization Grant test scheduler already has a pending delay");
        let settled = false;
        let resolveDelay = () => {};
        const promise = new Promise<void>((resolve) => {
          resolveDelay = resolve;
        });
        const delay: ScheduledDelay = {
          delayMs,
          complete() {
            if (settled)
              return;
            settled = true;
            pendingDelay = undefined;
            resolveDelay();
          },
        };
        pendingDelay = delay;
        const waiters = pendingDelayWaiters;
        pendingDelayWaiters = [];
        for (const resolve of waiters)
          resolve(delay);
        return {
          promise,
          cancel: delay.complete,
        };
      },
    },
  };
}

export function createInMemoryAuthorizationGrantRedemptionStore(
  options: CreateInMemoryAuthorizationGrantRedemptionStoreOptions = {},
): AuthorizationGrantRedemptionStore {
  const records = new Map<string, AuthorizationGrantRedemptionRecord>();
  const now = options.clock?.now ?? Date.now;

  return {
    async remove(grantId) {
      return records.delete(grantId) ? "removed" : "missing";
    },
    async initialize(record) {
      const currentTime = now();
      if (record.expiresAt <= currentTime)
        return "expired";
      const existing = records.get(record.grantId);
      if (existing !== undefined && existing.expiresAt > currentTime)
        return "exists";
      records.set(record.grantId, record);
      return "created";
    },
    async begin(input) {
      const currentTime = now();
      const record = records.get(input.grantId);
      if (record === undefined)
        return { status: "missing" };
      if (record.expiresAt <= currentTime) {
        records.delete(input.grantId);
        return { status: "expired" };
      }
      if (record.state === "consumed")
        return { status: "consumed" };
      if (record.state === "redeeming" && record.leaseExpiresAt > currentTime) {
        return {
          status: "busy",
          leaseExpiresAt: record.leaseExpiresAt,
        };
      }

      const leaseExpiresAt = Math.min(
        record.expiresAt,
        currentTime + input.leaseDurationMs,
      );
      const reservation = {
        attemptId: input.attemptId,
        expiresAt: record.expiresAt,
        grantId: record.grantId,
        leaseExpiresAt,
      };
      records.set(input.grantId, {
        version: 1,
        grantId: record.grantId,
        state: "redeeming",
        attemptId: input.attemptId,
        leaseExpiresAt,
        expiresAt: record.expiresAt,
      });
      return {
        status: "reserved",
        reservation,
      };
    },
    async renew(input) {
      const currentTime = now();
      const record = records.get(input.reservation.grantId);
      if (record === undefined)
        return { status: "missing" };
      if (record.expiresAt <= currentTime) {
        records.delete(input.reservation.grantId);
        return { status: "expired" };
      }
      if (record.state === "consumed")
        return { status: "consumed" };
      if (
        record.state !== "redeeming"
        || record.attemptId !== input.reservation.attemptId
        || record.leaseExpiresAt !== input.reservation.leaseExpiresAt
      ) {
        return { status: "stale-attempt" };
      }
      if (record.leaseExpiresAt <= currentTime)
        return { status: "lease-expired" };

      const leaseExpiresAt = Math.max(
        record.leaseExpiresAt,
        Math.min(
          record.expiresAt,
          currentTime + input.leaseDurationMs,
        ),
      );
      const reservation = {
        attemptId: record.attemptId,
        expiresAt: record.expiresAt,
        grantId: record.grantId,
        leaseExpiresAt,
      };
      records.set(record.grantId, {
        version: 1,
        grantId: record.grantId,
        state: "redeeming",
        attemptId: record.attemptId,
        leaseExpiresAt,
        expiresAt: record.expiresAt,
      });
      return {
        status: "renewed",
        reservation,
      };
    },
    async release(reservation) {
      const currentTime = now();
      const record = records.get(reservation.grantId);
      if (record === undefined)
        return "missing";
      if (record.expiresAt <= currentTime) {
        records.delete(reservation.grantId);
        return "expired";
      }
      if (record.state === "consumed")
        return "consumed";
      if (
        record.state !== "redeeming"
        || record.attemptId !== reservation.attemptId
        || record.leaseExpiresAt !== reservation.leaseExpiresAt
      ) {
        return "stale-attempt";
      }
      if (record.leaseExpiresAt <= currentTime)
        return "lease-expired";

      records.set(record.grantId, {
        version: 1,
        grantId: record.grantId,
        state: "issued",
        expiresAt: record.expiresAt,
      });
      return "released";
    },
    async consume(reservation) {
      const currentTime = now();
      const record = records.get(reservation.grantId);
      if (record === undefined)
        return "missing";
      if (record.expiresAt <= currentTime) {
        records.delete(reservation.grantId);
        return "expired";
      }
      if (record.state === "consumed")
        return "already-consumed";
      if (
        record.state !== "redeeming"
        || record.attemptId !== reservation.attemptId
        || record.leaseExpiresAt !== reservation.leaseExpiresAt
      ) {
        return "stale-attempt";
      }
      if (record.leaseExpiresAt <= currentTime)
        return "lease-expired";

      records.set(record.grantId, {
        version: 1,
        grantId: record.grantId,
        state: "consumed",
        expiresAt: record.expiresAt,
      });
      return "consumed";
    },
  };
}

interface ScheduledDelay {
  readonly complete: () => void;
  readonly delayMs: number;
}
