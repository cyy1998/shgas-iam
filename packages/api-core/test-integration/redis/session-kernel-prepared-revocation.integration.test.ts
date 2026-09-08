import type { PrincipalRef } from "../../src/session/kernel";
import type { RedisTestHarness, SessionKernelRedisTestScope } from "./redis-test-harness";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { encodeIndexMember } from "../../src/session/kernel";
import { createRedisTestHarness } from "./redis-test-harness";

const principal: PrincipalRef = {
  principalType: "user",
  subjectId: "00000000-0000-4000-8000-000000000001",
};
const generations = [
  "00000000-0000-4000-8000-000000000010",
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
] as const;
let harness: RedisTestHarness;
let scope: SessionKernelRedisTestScope;
let generation: string;
let blocking: boolean;
let validationCalls: number;
let warnings: Record<string, unknown>[];

beforeAll(async () => {
  harness = await createRedisTestHarness();
});
beforeEach(async () => {
  generation = generations[0];
  blocking = false;
  validationCalls = 0;
  warnings = [];
  scope = await harness.createSessionKernelScope({
    principalAccessFence: {
      capture: async () => generation,
      validate: async () => {
        validationCalls += 1;
        if (blocking)
          throw new Error("subject access is blocking");
        return { ok: true };
      },
    },
    logger: { warn: (fields) => { warnings.push(fields); } },
  });
});
afterEach(async () => {
  await scope.close();
});
afterAll(async () => {
  await harness.close();
});

async function createPrincipal(subjectId = principal.subjectId) {
  const result = await scope.writer.createPrincipalSession(subjectId);
  if (result.status !== "created" || !result.externalToken)
    throw new Error("expected Principal Session fixture");
  return { session: result.value, token: result.externalToken };
}

async function isActive(id: string) {
  return await scope.activeObjectExists({ kind: "principal_session", id });
}

describe("prepared user session revocation real Redis contract", () => {
  test("recaptures G0 after failed cleanup while the subject is blocking", async () => {
    const old = await createPrincipal();
    const first = await scope.writer.prepareUserSessionRevocation(principal);
    generation = generations[1];
    blocking = true;
    scope.failNextPrincipalRevoke();
    let failure: unknown;
    try {
      await first.revoke("user_disabled", { onlySubjectAccessTransitionId: generations[0] });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    const stillActive = await isActive(old.session.principalSessionId);
    expect(stillActive).toBe(true);

    const callsBeforeCapture = validationCalls;
    const second = await scope.writer.prepareUserSessionRevocation(principal);
    expect(validationCalls).toBe(callsBeforeCapture);
    const activeAfterCapture = await isActive(old.session.principalSessionId);
    expect(activeAfterCapture).toBe(true);
    const summary = await second.revoke("user_disabled", { onlySubjectAccessTransitionId: generations[1] });
    expect(summary.principalSessions.revoked).toBe(1);
    const activeAfterRevoke = await isActive(old.session.principalSessionId);
    expect(activeAfterRevoke).toBe(false);
  });

  test("delayed cleanup includes callback previous generation and preserves reenabled G3", async () => {
    const old = await createPrincipal();
    const plan = await scope.writer.prepareUserSessionRevocation(principal);
    generation = generations[1];
    const previous = await createPrincipal();
    generation = generations[3];
    const fresh = await createPrincipal();
    const summary = await plan.revoke("user_disabled", { onlySubjectAccessTransitionId: generations[1] });
    expect(summary.principalSessions).toEqual({ revoked: 2, excluded: 1, alreadyRevoked: 0, missing: 0 });
    const oldResult = await scope.observer.resolvePrincipalSession(old.token);
    const previousResult = await scope.observer.resolvePrincipalSession(previous.token);
    const freshResult = await scope.observer.resolvePrincipalSession(fresh.token);
    expect(oldResult.status).toBe("revoked");
    expect(previousResult.status).toBe("revoked");
    expect(freshResult.status).toBe("resolved");
    await plan.revoke("user_disabled");
    const oldAfterRetry = await scope.observer.resolvePrincipalSession(old.token);
    const freshAfterRetry = await scope.observer.resolvePrincipalSession(fresh.token);
    expect(oldAfterRetry.status).toBe("revoked");
    expect(freshAfterRetry.status).toBe("resolved");
  });

  test("capture failure returns an empty fallback that only cleans the callback generation", async () => {
    const old = await createPrincipal();
    scope.failNextUserIndexRead();
    const fallback = await scope.writer.prepareUserSessionRevocation(principal);
    expect(warnings).toMatchObject([{ kind: "prepare_user_session_revocation" }]);
    generation = generations[3];
    const fresh = await createPrincipal();
    const empty = await fallback.revoke("user_disabled");
    expect(empty.principalSessions.revoked).toBe(0);
    const beforeRevoke = await isActive(old.session.principalSessionId);
    expect(beforeRevoke).toBe(true);
    const summary = await fallback.revoke("user_disabled", { onlySubjectAccessTransitionId: generations[0] });
    expect(summary.principalSessions.revoked).toBe(1);
    const freshResult = await scope.observer.resolvePrincipalSession(fresh.token);
    expect(freshResult.status).toBe("resolved");
  });

  test("unknown or malformed roots and another principal cannot broaden an empty plan", async () => {
    const malformed = await createPrincipal();
    await scope.seedPrincipalPayload(malformed.session.principalSessionId, JSON.stringify({
      ...malformed.session,
      subjectAccessTransitionId: "unknown-generation",
    }));
    const foreign = await createPrincipal("00000000-0000-4000-8000-000000000099");
    await scope.seedUserIndexMember(principal, encodeIndexMember("principal_session", foreign.session.principalSessionId));
    await scope.seedUserIndexMember(principal, "unknown:missing");
    await scope.seedUserIndexMember(principal, encodeIndexMember("principal_session", "missing-root"));
    const plan = await scope.writer.prepareUserSessionRevocation(principal);
    const fresh = await createPrincipal();
    const empty = await plan.revoke("user_disabled");
    expect(empty.principalSessions.revoked).toBe(0);
    const targeted = await plan.revoke("user_disabled", { onlySubjectAccessTransitionId: generations[0] });
    expect(targeted.principalSessions.revoked).toBe(1);
    const foreignResult = await scope.observer.resolvePrincipalSession(foreign.token);
    const malformedActive = await isActive(malformed.session.principalSessionId);
    const freshResult = await scope.observer.resolvePrincipalSession(fresh.token);
    expect(foreignResult.status).toBe("resolved");
    expect(malformedActive).toBe(true);
    expect(freshResult.status).toBe("revoked");
  });

  test("attempts remaining captured generations after one generation fails", async () => {
    const old = await createPrincipal();
    generation = generations[1];
    const newer = await createPrincipal();
    const plan = await scope.writer.prepareUserSessionRevocation(principal);
    scope.failNextPrincipalRevoke();
    let failure: unknown;
    try {
      await plan.revoke("user_disabled");
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    const remaining = await Promise.all([
      isActive(old.session.principalSessionId),
      isActive(newer.session.principalSessionId),
    ]);
    expect(remaining.filter(Boolean)).toHaveLength(1);
    const retry = await scope.writer.prepareUserSessionRevocation(principal);
    const summary = await retry.revoke("user_disabled");
    expect(summary.principalSessions.revoked).toBe(1);
  });
});
