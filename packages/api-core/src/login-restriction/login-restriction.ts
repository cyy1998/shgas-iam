export const LOGIN_FAILURE_THRESHOLD = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 30 * 60;
export const LOGIN_RESTRICTION_DURATION_SECONDS = 30 * 60;
export const LOGIN_RESTRICTION_CAUSE = "too_many_login_failures" as const;

export type LoginRestrictionTriggerMethod = "password" | "mobile" | "unknown";

export interface TemporaryLoginRestriction {
  userId: number;
  cause: typeof LOGIN_RESTRICTION_CAUSE;
  triggerMethod: LoginRestrictionTriggerMethod;
  restrictedUntil: number;
  remainingSeconds: number;
}

export interface LoginFailureResult {
  failureCount: number;
  remainingAttempts: number;
  newlyRestricted: boolean;
  restriction: TemporaryLoginRestriction | null;
}

export interface ClearLoginRestrictionStateResult {
  changed: boolean;
  failureStateCleared: true;
  restriction: TemporaryLoginRestriction | null;
}

export interface ListLoginRestrictionsInput {
  offset: number;
  limit: number;
  userId?: number;
}

export interface ListLoginRestrictionsResult {
  items: TemporaryLoginRestriction[];
  total: number;
}

export interface LoginRestrictionAtomicState {
  userId: number;
  triggerMethod: unknown;
  restrictedUntil: number;
  remainingMilliseconds: number;
}

export interface RecordLoginFailureAtomicResult {
  failureCount: number;
  newlyRestricted: boolean;
  restriction: LoginRestrictionAtomicState | null;
}

export interface ClearLoginStateAtomicResult {
  changed: boolean;
  restriction: LoginRestrictionAtomicState | null;
}

export interface ListLoginRestrictionsAtomicResult {
  items: LoginRestrictionAtomicState[];
  total: number;
}

/**
 * Storage boundary for state transitions that must be indivisible to callers.
 * Implementations own their consistency mechanism; callers do not observe Redis
 * commands, scripts, or key ordering.
 */
export interface LoginRestrictionAtomicStorePort {
  recordFailure: (input: {
    userId: number;
    triggerMethod: Exclude<LoginRestrictionTriggerMethod, "unknown">;
    failureMember: string;
  }) => Promise<RecordLoginFailureAtomicResult>;
  getRestriction: (userId: number) => Promise<LoginRestrictionAtomicState | null>;
  clearLoginState: (userId: number) => Promise<ClearLoginStateAtomicResult>;
  listRestrictions: (input: {
    offset: number;
    limit: number;
  }) => Promise<ListLoginRestrictionsAtomicResult>;
}

export interface CreateLoginRestrictionOptions {
  store: LoginRestrictionAtomicStorePort;
  clock: {
    now: () => number;
  };
  random: {
    uuid: () => string;
  };
}

export class LoginRestrictionUnavailableError extends Error {
  constructor(options: { cause?: unknown } = {}) {
    super("Temporary Login Restriction state is unavailable", options);
    this.name = "LoginRestrictionUnavailableError";
  }
}

function normalizeTriggerMethod(value: unknown): LoginRestrictionTriggerMethod {
  return value === "password" || value === "mobile" ? value : "unknown";
}

function requireFiniteNumber(value: unknown, operation: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new TypeError(`Login restriction ${operation} returned an invalid number`);
  return parsed;
}

function toRestriction(
  state: LoginRestrictionAtomicState | null,
): TemporaryLoginRestriction | null {
  if (state === null)
    return null;

  const userId = requireFiniteNumber(state.userId, "state");
  const restrictedUntil = requireFiniteNumber(state.restrictedUntil, "state");
  const remainingMilliseconds = requireFiniteNumber(state.remainingMilliseconds, "state");
  if (remainingMilliseconds <= 0)
    return null;

  return {
    userId,
    cause: LOGIN_RESTRICTION_CAUSE,
    triggerMethod: normalizeTriggerMethod(state.triggerMethod),
    restrictedUntil,
    remainingSeconds: Math.max(1, Math.ceil(remainingMilliseconds / 1000)),
  };
}

export function createLoginRestriction(options: CreateLoginRestrictionOptions) {
  async function run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    }
    catch (error) {
      if (error instanceof LoginRestrictionUnavailableError)
        throw error;
      throw new LoginRestrictionUnavailableError({ cause: error });
    }
  }

  async function recordFailure(input: {
    userId: number;
    triggerMethod: Exclude<LoginRestrictionTriggerMethod, "unknown">;
  }): Promise<LoginFailureResult> {
    return await run(async () => {
      const result = await options.store.recordFailure({
        ...input,
        failureMember: `${options.clock.now()}:${options.random.uuid()}`,
      });
      const failureCount = requireFiniteNumber(result.failureCount, "record failure");

      return {
        failureCount,
        remainingAttempts: Math.max(LOGIN_FAILURE_THRESHOLD - failureCount, 0),
        newlyRestricted: result.newlyRestricted,
        restriction: toRestriction(result.restriction),
      };
    });
  }

  async function getRestriction(userId: number): Promise<TemporaryLoginRestriction | null> {
    return await run(async () => toRestriction(
      await options.store.getRestriction(userId),
    ));
  }

  async function clearLoginState(userId: number): Promise<ClearLoginRestrictionStateResult> {
    return await run(async () => {
      const result = await options.store.clearLoginState(userId);
      return {
        changed: result.changed,
        failureStateCleared: true,
        restriction: toRestriction(result.restriction),
      };
    });
  }

  async function listRestrictions(input: ListLoginRestrictionsInput): Promise<ListLoginRestrictionsResult> {
    if (!Number.isInteger(input.offset) || input.offset < 0)
      throw new RangeError("Login restriction offset must be a non-negative integer");
    if (!Number.isInteger(input.limit) || input.limit <= 0)
      throw new RangeError("Login restriction limit must be a positive integer");

    if (input.userId !== undefined) {
      const restriction = await getRestriction(input.userId);
      return {
        items: restriction !== null && input.offset === 0 ? [restriction] : [],
        total: restriction === null ? 0 : 1,
      };
    }

    return await run(async () => {
      const result = await options.store.listRestrictions({
        limit: input.limit,
        offset: input.offset,
      });
      const items = result.items.map((state) => {
        const restriction = toRestriction(state);
        if (restriction === null)
          throw new TypeError("Login restriction inventory returned expired state");
        return restriction;
      });

      return {
        items,
        total: requireFiniteNumber(result.total, "inventory"),
      };
    });
  }

  return {
    clearLoginState,
    getRestriction,
    listRestrictions,
    recordFailure,
  };
}

export type LoginRestriction = ReturnType<typeof createLoginRestriction>;
