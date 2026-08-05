import type {
  LoginRestrictionAtomicState,
  LoginRestrictionAtomicStorePort,
} from "../../src/login-restriction";
import {
  LOGIN_FAILURE_THRESHOLD,
  LOGIN_FAILURE_WINDOW_SECONDS,
  LOGIN_RESTRICTION_DURATION_SECONDS,
} from "../../src/login-restriction";

interface FailureEvent {
  member: string;
  occurredAt: number;
}

interface StoredRestriction {
  triggerMethod: string;
  restrictedUntil: number;
}

export function createLoginRestrictionStoreFake(now: () => number = Date.now) {
  const failures = new Map<number, FailureEvent[]>();
  const restrictions = new Map<number, StoredRestriction>();
  const restrictionIndex = new Map<number, number>();

  function readRestriction(userId: number): StoredRestriction | null {
    const restriction = restrictions.get(userId);
    if (restriction === undefined || restriction.restrictedUntil <= now()) {
      restrictions.delete(userId);
      restrictionIndex.delete(userId);
      return null;
    }
    return restriction;
  }

  function toAtomicState(
    userId: number,
    restriction: StoredRestriction | null,
  ): LoginRestrictionAtomicState | null {
    if (restriction === null)
      return null;
    return {
      userId,
      triggerMethod: restriction.triggerMethod,
      restrictedUntil: restriction.restrictedUntil,
      remainingMilliseconds: restriction.restrictedUntil - now(),
    };
  }

  const store: LoginRestrictionAtomicStorePort = {
    async recordFailure(input) {
      const operationNow = now();
      const windowStart = operationNow - LOGIN_FAILURE_WINDOW_SECONDS * 1000;
      const currentFailures = (failures.get(input.userId) ?? [])
        .filter(failure => failure.occurredAt > windowStart)
        .filter(failure => failure.member !== input.failureMember);
      currentFailures.push({
        member: input.failureMember,
        occurredAt: operationNow,
      });
      failures.set(input.userId, currentFailures);

      const failureCount = currentFailures.length;
      let restriction = readRestriction(input.userId);
      let newlyRestricted = false;
      if (failureCount >= LOGIN_FAILURE_THRESHOLD) {
        if (restriction === null) {
          restriction = {
            triggerMethod: input.triggerMethod,
            restrictedUntil: operationNow + LOGIN_RESTRICTION_DURATION_SECONDS * 1000,
          };
          restrictions.set(input.userId, restriction);
          newlyRestricted = true;
        }
        restrictionIndex.set(input.userId, restriction.restrictedUntil);
      }

      return {
        failureCount,
        newlyRestricted,
        restriction: toAtomicState(input.userId, restriction),
      };
    },

    async getRestriction(userId) {
      return toAtomicState(userId, readRestriction(userId));
    },

    async clearLoginState(userId) {
      const restriction = readRestriction(userId);
      failures.delete(userId);
      restrictions.delete(userId);
      restrictionIndex.delete(userId);
      return {
        changed: restriction !== null,
        restriction: toAtomicState(userId, restriction),
      };
    },

    async listRestrictions(input) {
      const indexed = [...restrictionIndex.entries()]
        .sort((left, right) =>
          right[1] - left[1]
          || String(right[0]).localeCompare(String(left[0])));
      const valid: LoginRestrictionAtomicState[] = [];

      for (const [userId] of indexed) {
        const restriction = readRestriction(userId);
        const state = toAtomicState(userId, restriction);
        if (state !== null)
          valid.push(state);
      }

      return {
        items: valid.slice(input.offset, input.offset + input.limit),
        total: valid.length,
      };
    },
  };

  return {
    ...store,

    seedIndexMember(input: {
      userId: number;
      restrictedUntil: number;
    }) {
      restrictionIndex.set(input.userId, input.restrictedUntil);
    },

    seedRestriction(input: {
      userId: number;
      triggerMethod: string;
      expiresAt: number;
      indexed?: boolean;
    }) {
      restrictions.set(input.userId, {
        restrictedUntil: input.expiresAt,
        triggerMethod: input.triggerMethod,
      });
      if (input.indexed !== false)
        restrictionIndex.set(input.userId, input.expiresAt);
    },
  };
}
