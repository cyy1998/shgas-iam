import type { AuthorizationGrantReservation } from "./model";
import type { AuthorizationGrantRedemptionStore } from "./store";

export interface CreateAuthorizationGrantRedemptionOptions {
  readonly leaseDurationMs: number;
  readonly random: {
    readonly uuid: () => string;
  };
  readonly scheduler?: AuthorizationGrantRedemptionScheduler;
  readonly store: AuthorizationGrantRedemptionStore;
}

export interface AuthorizationGrantRedemptionScheduler {
  readonly delay: (delayMs: number) => {
    readonly cancel: () => void;
    readonly promise: Promise<void>;
  };
}

export interface AuthorizationGrantLease {
  readonly consume: () => ReturnType<AuthorizationGrantRedemptionStore["consume"]>;
  readonly release: () => ReturnType<AuthorizationGrantRedemptionStore["release"]>;
}

export class AuthorizationGrantLeaseLostError extends Error {
  constructor(readonly status: string) {
    super(`Authorization grant lease lost: ${status}`);
    this.name = "AuthorizationGrantLeaseLostError";
  }
}

const systemScheduler: AuthorizationGrantRedemptionScheduler = {
  delay: cancellableDelay,
};

export function createAuthorizationGrantRedemption(
  options: CreateAuthorizationGrantRedemptionOptions,
) {
  const leaseDurationMs = requirePositiveSafeInteger(
    options.leaseDurationMs,
    "authorization grant lease duration",
  );
  const scheduler = options.scheduler ?? systemScheduler;

  return {
    async initialize(input: {
      readonly expiresAt: number;
      readonly grantId: string;
    }) {
      return await options.store.initialize({
        version: 1,
        grantId: input.grantId,
        state: "issued",
        expiresAt: requirePositiveSafeInteger(
          input.expiresAt,
          "authorization grant expiry",
        ),
      });
    },
    async begin(grantId: string) {
      return await options.store.begin({
        attemptId: options.random.uuid(),
        grantId,
        leaseDurationMs,
      });
    },
    async renew(reservation: AuthorizationGrantReservation) {
      return await options.store.renew({
        leaseDurationMs,
        reservation,
      });
    },
    async withLease<T>(
      reservation: AuthorizationGrantReservation,
      operation: (lease: AuthorizationGrantLease) => Promise<T>,
    ): Promise<T> {
      let currentReservation = reservation;
      let heartbeatFailure: unknown;
      let stopRequested = false;
      let settled = false;
      let cancelDelay = () => {};
      const heartbeatIntervalMs = Math.max(
        1,
        Math.floor(leaseDurationMs / 3),
      );

      const heartbeatTask = (async () => {
        while (true) {
          if (stopRequested)
            return;
          const delay = scheduler.delay(heartbeatIntervalMs);
          cancelDelay = delay.cancel;
          await delay.promise;
          cancelDelay = () => {};
          if (stopRequested)
            return;
          try {
            const renewed = await options.store.renew({
              leaseDurationMs,
              reservation: currentReservation,
            });
            if (renewed.status !== "renewed") {
              heartbeatFailure = new AuthorizationGrantLeaseLostError(
                renewed.status,
              );
              return;
            }
            currentReservation = renewed.reservation;
          }
          catch (error) {
            heartbeatFailure = error;
            return;
          }
        }
      })();

      async function stopHeartbeat() {
        stopRequested = true;
        cancelDelay();
        await heartbeatTask;
      }

      async function prepareSettlement() {
        if (settled)
          throw new AuthorizationGrantLeaseLostError("already-settled");
        settled = true;
        await stopHeartbeat();
        if (heartbeatFailure !== undefined)
          throw heartbeatFailure;
      }

      try {
        const result = await operation({
          consume: async () => {
            await prepareSettlement();
            return await options.store.consume(currentReservation);
          },
          release: async () => {
            await prepareSettlement();
            return await options.store.release(currentReservation);
          },
        });
        if (heartbeatFailure !== undefined)
          throw heartbeatFailure;
        return result;
      }
      finally {
        await stopHeartbeat();
      }
    },
    async release(reservation: Parameters<AuthorizationGrantRedemptionStore["release"]>[0]) {
      return await options.store.release(reservation);
    },
    async consume(reservation: Parameters<AuthorizationGrantRedemptionStore["consume"]>[0]) {
      return await options.store.consume(reservation);
    },
  };
}

function cancellableDelay(delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveDelay = () => {};
  const promise = new Promise<void>((resolve) => {
    resolveDelay = resolve;
    timer = setTimeout(resolve, delayMs);
  });
  return {
    promise,
    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        resolveDelay();
      }
    },
  };
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${name} must be a positive safe integer`);
  return value;
}

export type AuthorizationGrantRedemption = ReturnType<
  typeof createAuthorizationGrantRedemption
>;
