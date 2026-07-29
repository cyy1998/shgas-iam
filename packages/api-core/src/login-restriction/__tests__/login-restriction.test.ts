import { expect, test } from "bun:test";
import {
  createLoginRestriction,
  LoginRestrictionUnavailableError,
} from "../login-restriction";
import { createLoginRestrictionStoreFake } from "./login-restriction-store.fake";

test("the fifth mixed login failure creates one temporary restriction at the shared user boundary", async () => {
  let now = 1_800_000_000_000;
  let sequence = 0;
  const loginRestriction = createLoginRestriction({
    clock: { now: () => now },
    random: { uuid: () => `failure-${++sequence}` },
    store: createLoginRestrictionStoreFake(() => now),
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await expect(loginRestriction.recordFailure({
      userId: 1001,
      triggerMethod: "password",
    })).resolves.toEqual({
      failureCount: attempt,
      newlyRestricted: false,
      remainingAttempts: 5 - attempt,
      restriction: null,
    });
    now += 1;
  }

  await expect(loginRestriction.recordFailure({
    userId: 1001,
    triggerMethod: "mobile",
  })).resolves.toEqual({
    failureCount: 5,
    newlyRestricted: true,
    remainingAttempts: 0,
    restriction: {
      cause: "too_many_login_failures",
      remainingSeconds: 30 * 60,
      restrictedUntil: now + 30 * 60 * 1000,
      triggerMethod: "mobile",
      userId: 1001,
    },
  });
  await expect(loginRestriction.getRestriction(1001)).resolves.toEqual({
    cause: "too_many_login_failures",
    remainingSeconds: 30 * 60,
    restrictedUntil: now + 30 * 60 * 1000,
    triggerMethod: "mobile",
    userId: 1001,
  });
});

test("clearing login restriction state removes the restriction, failure history, and index without a grace period", async () => {
  const now = 1_800_000_000_000;
  let sequence = 0;
  const loginRestriction = createLoginRestriction({
    clock: { now: () => now },
    random: { uuid: () => `failure-${++sequence}` },
    store: createLoginRestrictionStoreFake(() => now),
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await loginRestriction.recordFailure({
      userId: 1001,
      triggerMethod: "password",
    });
  }

  await expect(loginRestriction.clearLoginState(1001)).resolves.toEqual({
    changed: true,
    failureStateCleared: true,
    restriction: {
      cause: "too_many_login_failures",
      remainingSeconds: 30 * 60,
      restrictedUntil: now + 30 * 60 * 1000,
      triggerMethod: "password",
      userId: 1001,
    },
  });
  await expect(loginRestriction.getRestriction(1001)).resolves.toBeNull();
  await expect(loginRestriction.recordFailure({
    userId: 1001,
    triggerMethod: "mobile",
  })).resolves.toEqual({
    failureCount: 1,
    newlyRestricted: false,
    remainingAttempts: 4,
    restriction: null,
  });
});

test("naturally expired restrictions stop blocking login and are removed from the shared inventory", async () => {
  let now = 1_800_000_000_000;
  let sequence = 0;
  const loginRestriction = createLoginRestriction({
    clock: { now: () => now },
    random: { uuid: () => `failure-${++sequence}` },
    store: createLoginRestrictionStoreFake(() => now),
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await loginRestriction.recordFailure({
      userId: 1001,
      triggerMethod: "password",
    });
  }
  now += 30 * 60 * 1000 + 1;

  await expect(loginRestriction.getRestriction(1001)).resolves.toBeNull();
  await expect(loginRestriction.listRestrictions({
    limit: 20,
    offset: 0,
  })).resolves.toEqual({
    items: [],
    total: 0,
  });
});

test("restriction inventory maps legacy trigger values to unknown and repairs dangling index members", async () => {
  const now = 1_800_000_000_000;
  const store = createLoginRestrictionStoreFake(() => now);
  store.seedRestriction({
    expiresAt: now + 10 * 60 * 1000,
    triggerMethod: "legacy-value",
    userId: 1001,
  });
  store.seedIndexMember({
    restrictedUntil: now + 20 * 60 * 1000,
    userId: 2002,
  });
  const loginRestriction = createLoginRestriction({
    clock: { now: () => now },
    random: { uuid: () => "unused" },
    store,
  });

  await expect(loginRestriction.listRestrictions({
    limit: 20,
    offset: 0,
  })).resolves.toEqual({
    items: [{
      cause: "too_many_login_failures",
      remainingSeconds: 10 * 60,
      restrictedUntil: now + 10 * 60 * 1000,
      triggerMethod: "unknown",
      userId: 1001,
    }],
    total: 1,
  });
  await expect(loginRestriction.listRestrictions({
    limit: 20,
    offset: 0,
  })).resolves.toHaveProperty("total", 1);
});

test("reading a pre-existing unindexed restriction does not backfill the global inventory", async () => {
  const now = 1_800_000_000_000;
  const store = createLoginRestrictionStoreFake(() => now);
  store.seedRestriction({
    expiresAt: now + 10 * 60 * 1000,
    indexed: false,
    triggerMethod: "password",
    userId: 1001,
  });
  const loginRestriction = createLoginRestriction({
    clock: { now: () => now },
    random: { uuid: () => "unused" },
    store,
  });

  await expect(loginRestriction.getRestriction(1001)).resolves.toMatchObject({
    triggerMethod: "password",
    userId: 1001,
  });
  await expect(loginRestriction.listRestrictions({
    limit: 20,
    offset: 0,
  })).resolves.toEqual({
    items: [],
    total: 0,
  });
});

test("concurrent failures have one observable sequence and one threshold transition", async () => {
  const now = 1_800_000_000_000;
  let sequence = 0;
  const loginRestriction = createLoginRestriction({
    clock: { now: () => now },
    random: { uuid: () => `failure-${++sequence}` },
    store: createLoginRestrictionStoreFake(() => now),
  });

  const results = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    loginRestriction.recordFailure({
      userId: 1001,
      triggerMethod: index % 2 === 0 ? "password" : "mobile",
    })));

  expect(results.map(result => result.failureCount).sort((left, right) => left - right))
    .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(results.filter(result => result.newlyRestricted)).toHaveLength(1);
  await expect(loginRestriction.listRestrictions({
    limit: 20,
    offset: 0,
  })).resolves.toHaveProperty("total", 1);
});

test("failures outside the rolling window do not contribute to a new restriction", async () => {
  let now = 1_800_000_000_000;
  let sequence = 0;
  const loginRestriction = createLoginRestriction({
    clock: { now: () => now },
    random: { uuid: () => `failure-${++sequence}` },
    store: createLoginRestrictionStoreFake(() => now),
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await loginRestriction.recordFailure({
      userId: 1001,
      triggerMethod: "password",
    });
  }
  now += 30 * 60 * 1000 + 1;

  await expect(loginRestriction.recordFailure({
    userId: 1001,
    triggerMethod: "mobile",
  })).resolves.toEqual({
    failureCount: 1,
    newlyRestricted: false,
    remainingAttempts: 4,
    restriction: null,
  });
});

test("restriction inventory is ordered by expiry and supports an exact user filter", async () => {
  let now = 1_800_000_000_000;
  let sequence = 0;
  const loginRestriction = createLoginRestriction({
    clock: { now: () => now },
    random: { uuid: () => `failure-${++sequence}` },
    store: createLoginRestrictionStoreFake(() => now),
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await loginRestriction.recordFailure({
      userId: 1001,
      triggerMethod: "password",
    });
  }
  now += 1_000;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await loginRestriction.recordFailure({
      userId: 2002,
      triggerMethod: "mobile",
    });
  }

  await expect(loginRestriction.listRestrictions({
    limit: 1,
    offset: 0,
  })).resolves.toMatchObject({
    items: [{ userId: 2002 }],
    total: 2,
  });
  await expect(loginRestriction.listRestrictions({
    limit: 20,
    offset: 0,
    userId: 1001,
  })).resolves.toMatchObject({
    items: [{ userId: 1001 }],
    total: 1,
  });
});

test("one inventory page neither duplicates nor omits near-simultaneous expirations when the caller clock is behind", async () => {
  const redisNow = 1_800_000_000_000;
  const callerNow = redisNow - 24 * 60 * 60 * 1000;
  const store = createLoginRestrictionStoreFake(() => redisNow);
  store.seedRestriction({
    expiresAt: redisNow + 10_003,
    triggerMethod: "password",
    userId: 1001,
  });
  store.seedRestriction({
    expiresAt: redisNow + 10_002,
    triggerMethod: "mobile",
    userId: 2002,
  });
  store.seedRestriction({
    expiresAt: redisNow + 10_001,
    triggerMethod: "password",
    userId: 3003,
  });
  const loginRestriction = createLoginRestriction({
    clock: { now: () => callerNow },
    random: { uuid: () => "unused" },
    store,
  });

  const result = await loginRestriction.listRestrictions({
    limit: 3,
    offset: 0,
  });

  expect(result.items.map(item => item.userId)).toEqual([1001, 2002, 3003]);
  expect(new Set(result.items.map(item => item.userId)).size).toBe(3);
  expect(result.total).toBe(3);
});

test("Redis failures are exposed as the shared unavailable error", async () => {
  const cause = new Error("Redis unavailable");
  const loginRestriction = createLoginRestriction({
    clock: { now: () => 1_800_000_000_000 },
    random: { uuid: () => "unused" },
    store: {
      clearLoginState: async () => {
        throw cause;
      },
      getRestriction: async () => {
        throw cause;
      },
      listRestrictions: async () => {
        throw cause;
      },
      recordFailure: async () => {
        throw cause;
      },
    },
  });

  try {
    await loginRestriction.getRestriction(1001);
    throw new Error("expected getRestriction to fail");
  }
  catch (error) {
    expect(error).toBeInstanceOf(LoginRestrictionUnavailableError);
    expect(error).toHaveProperty("cause", cause);
  }
});
