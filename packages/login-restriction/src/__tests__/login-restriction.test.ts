import { expect, test } from "bun:test";
import type { LoginRestriction, LoginRestrictionAtomicStorePort } from "@iam/login-restriction";
import { createLoginRestriction, LoginRestrictionUnavailableError } from "@iam/login-restriction";

const state = {
  remainingMilliseconds: 1_001,
  restrictedUntil: 1_800_000_001_001,
  triggerMethod: "unrecognized",
  userId: 1001,
};

function createSubject(store: Partial<LoginRestrictionAtomicStorePort> = {}) {
  const unexpected = async () => {
    throw new Error("Unexpected store operation");
  };
  return createLoginRestriction({
    clock: { now: () => 1_800_000_000_000 },
    random: { uuid: () => "failure-id" },
    store: {
      clearLoginState: unexpected,
      getRestriction: unexpected,
      listRestrictions: unexpected,
      recordFailure: unexpected,
      ...store,
    },
  });
}

test.each([
  { offset: -1, limit: 1 },
  { offset: 0.5, limit: 1 },
  { offset: 0, limit: 0 },
  { offset: 0, limit: 0.5 },
])("invalid pagination %j is rejected before storage access", async (input) => {
  const error = await createSubject()
    .listRestrictions(input)
    .catch((error: unknown) => error);
  expect(error).toBeInstanceOf(RangeError);
});

test.each([
  { exists: true, offset: 0, expectedUserIds: [1001], total: 1 },
  { exists: true, offset: 1, expectedUserIds: [], total: 1 },
  { exists: false, offset: 0, expectedUserIds: [], total: 0 },
])("exact user filtering preserves total for %j", async ({ exists, offset, expectedUserIds, total }) => {
  const subject = createSubject({ getRestriction: async () => (exists ? state : null) });
  const result = await subject.listRestrictions({ userId: 1001, offset, limit: 1 });
  expect({ userIds: result.items.map((item) => item.userId), total: result.total }).toEqual({
    userIds: [...expectedUserIds],
    total,
  });
});

test("failure results normalize unknown methods, round remaining seconds up and clamp remaining attempts", async () => {
  const subject = createSubject({
    recordFailure: async () => ({ failureCount: 6, newlyRestricted: false, restriction: state }),
  });
  const result = await subject.recordFailure({ userId: 1001, triggerMethod: "password" });
  expect(result).toEqual({
    failureCount: 6,
    newlyRestricted: false,
    remainingAttempts: 0,
    restriction: {
      cause: "too_many_login_failures",
      remainingSeconds: 2,
      restrictedUntil: state.restrictedUntil,
      triggerMethod: "unknown",
      userId: 1001,
    },
  });
});

test("an expired atomic state maps to no effective restriction", async () => {
  const subject = createSubject({ getRestriction: async () => ({ ...state, remainingMilliseconds: 0 }) });
  const result = await subject.getRestriction(1001);
  expect(result).toBeNull();
});

const operations: ReadonlyArray<{ name: string; run: (subject: LoginRestriction) => Promise<unknown> }> = [
  { name: "getRestriction", run: (subject) => subject.getRestriction(1001) },
  { name: "clearLoginState", run: (subject) => subject.clearLoginState(1001) },
  { name: "listRestrictions", run: (subject) => subject.listRestrictions({ offset: 0, limit: 1 }) },
  { name: "recordFailure", run: (subject) => subject.recordFailure({ userId: 1001, triggerMethod: "password" }) },
];

test.each(operations)("$name exposes dependency failure as unavailable with the original cause", async ({ run }) => {
  const cause = new Error("Redis unavailable");
  const fail = async () => {
    throw cause;
  };
  const subject = createSubject({
    clearLoginState: fail,
    getRestriction: fail,
    listRestrictions: fail,
    recordFailure: fail,
  });
  const error = await run(subject).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(LoginRestrictionUnavailableError);
  expect(error).toHaveProperty("cause", cause);
});

test("an existing unavailable error is preserved", async () => {
  const original = new LoginRestrictionUnavailableError();
  const subject = createSubject({
    getRestriction: async () => {
      throw original;
    },
  });
  const error = await subject.getRestriction(1001).catch((error: unknown) => error);
  expect(error).toBe(original);
});

test.each([
  {
    name: "nonfinite failure count",
    store: { recordFailure: async () => ({ failureCount: Number.NaN, newlyRestricted: false, restriction: null }) },
    run: (subject: LoginRestriction) => subject.recordFailure({ userId: 1001, triggerMethod: "password" }),
  },
  {
    name: "expired inventory entry",
    store: { listRestrictions: async () => ({ items: [{ ...state, remainingMilliseconds: 0 }], total: 1 }) },
    run: (subject: LoginRestriction) => subject.listRestrictions({ offset: 0, limit: 1 }),
  },
])("$name is rejected as unavailable", async ({ store, run }) => {
  const subject = createSubject(store);
  const error = await run(subject).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(LoginRestrictionUnavailableError);
  expect(error).toHaveProperty("cause", expect.any(TypeError));
});
