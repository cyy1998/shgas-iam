import type { ClientSessionObservation, UserSessionObservation } from "@iam/session-kernel";
import { SessionObservationRequiredError, SessionStorageError } from "@iam/session-kernel";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

let scope: Awaited<ReturnType<typeof createUnifiedSessionRedisTestScope>>;
beforeEach(async () => {
  const url = process.env.IAM_SESSION_KERNEL_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_SESSION_KERNEL_TEST_REDIS_URL must point to a dedicated Redis instance");
  scope = await createUnifiedSessionRedisTestScope(url);
});
afterEach(async () => {
  await scope.close();
});

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const authentication = {
  subjectIdentifier,
  subjectContext: "opaque-generation",
  amr: ["pwd"],
  origin: { ip: "127.0.0.1" },
};
function operation(factory = scope.kernel) {
  const lifecycle = scope.createOperation();
  return { ...lifecycle, api: factory.forOperation(lifecycle.operation) };
}
async function fixture() {
  const op = operation();
  const root = await op.api.createUserSession(authentication);
  const child = await open(op.api, root.observation);
  return { ...op, root, child };
}
async function open(
  api: ReturnType<typeof operation>["api"],
  root: UserSessionObservation,
  clientId = "client-a",
  protocol: "oidc" | "custom_sso" = "oidc",
) {
  const result = await api.openClientSession(root, { clientId, protocol });
  if (!("value" in result))
    throw new Error(`Fixture open failed: ${result.status}`);
  return result.value;
}
function target(child: ClientSessionObservation) {
  return {
    userSessionId: child.userSession.userSessionId,
    clientSessionId: child.clientSession.clientSessionId,
    clientId: child.clientSession.clientId,
  };
}
async function rejection(action: () => unknown | Promise<unknown>) {
  let error: unknown;
  try {
    await action();
  }
  catch (cause) {
    error = cause;
  }
  return error;
}

test("root identity, authentication, subject context and Redis deadline are fixed; bearer is not its internal ID", async () => {
  const { api, root } = await fixture();
  const another = await api.createUserSession(authentication);
  expect(another.observation.userSession.userSessionId).not.toBe(root.observation.userSession.userSessionId);
  const byBearer = await api.resolveUserSession(root.bearer);
  const idAsBearer = await api.resolveUserSession(root.observation.userSession.userSessionId);
  const byId = await api.resolveUserSessionById(root.observation.userSession.userSessionId);
  if (byBearer.status !== "resolved" || byId.status !== "resolved")
    throw new Error("Root lookup failed");
  expect(byBearer.value.userSession).toEqual(byId.value.userSession);
  expect(idAsBearer.status).toBe("missing");
  const stored = await scope.bearerStored(root.bearer);
  expect(stored).not.toContain(root.bearer);
  expect(root.observation.userSession).toMatchObject(authentication);
  expect(root.observation.userSession.expiresAt - root.observation.userSession.createdAt).toBe(3600000);
  const revoked = await api.revokeObservedUserSession(root.observation);
  const inspected = await scope.inspect(revoked.target);
  expect(inspected.record).toEqual({ ...root.observation.userSession, state: "terminated" });
  expect(inspected.expiresAt).toBe(inspected.relatedExpiresAt);
});

test("bounded neutral inventory lists both record kinds without minting an online observation", async () => {
  const { api, root, child } = await fixture();
  await api.createUserSession(authentication);
  const roots = await api.listSessions({ kind: "userSession", offset: 0, limit: 1 });
  const clients = await api.listSessions({ kind: "clientSession", subjectIdentifier, offset: 0, limit: 1 });
  expect(roots.total).toBe(2);
  expect(roots.records).toHaveLength(1);
  expect(clients.total).toBe(1);
  expect(clients.records[0]).toEqual(child.clientSession);
  const fakeParent = await rejection(() =>
    api.openClientSession({ userSession: roots.records[0] } as UserSessionObservation, {
      clientId: "other",
      protocol: "oidc",
    }),
  );
  expect(fakeParent).toBeInstanceOf(SessionObservationRequiredError);
  scope.failNext("list");
  const overBudget = await rejection(() => api.listSessions({ kind: "userSession", offset: 0, limit: 1001 }));
  expect(overBudget).toBeInstanceOf(Error);
  const transport = await rejection(() => api.listSessions({ kind: "userSession", offset: 0, limit: 1 }));
  expect(transport).toBeInstanceOf(SessionStorageError);
  const rootStatus = await api.resolveUserSession(root.bearer);
  expect(rootStatus.status).toBe("resolved");
});

test("application inventory paginates within one root and excludes other logins of the same user", async () => {
  const { api, root, child } = await fixture();
  const sibling = await open(api, root.observation, "client-b");
  const anotherRoot = await api.createUserSession(authentication);
  await open(api, anotherRoot.observation);
  const query = {
    kind: "clientSession" as const,
    userSessionId: root.observation.userSession.userSessionId,
    limit: 1,
  };
  const first = await api.listSessions({ ...query, offset: 0 });
  const second = await api.listSessions({ ...query, offset: 1 });
  expect(first.total).toBe(2);
  expect(second.total).toBe(2);
  expect([...first.records, ...second.records]).toEqual(expect.arrayContaining([
    child.clientSession,
    sibling.clientSession,
  ]));
  await api.revokeObservedClientSession(child);
  const remaining = await api.listSessions({ ...query, offset: 0 });
  expect(remaining.total).toBe(1);
  expect(remaining.records).toEqual([sibling.clientSession]);
  const invalid = await rejection(() => api.listSessions({ ...query, kind: "userSession", offset: 0 }));
  expect(invalid).toBeInstanceOf(Error);
});

test("parallel authorization has one live instance and protocol changes reuse it without extending roots or old artifact deadlines", async () => {
  const { api, root, child } = await fixture();
  const oldLifetime = await api.getIssuanceLifetime(child, 600);
  const parallel = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      open(api, root.observation, "client-a", i % 2 ? "oidc" : "custom_sso")),
  );
  expect(new Set(parallel.map(value => value.clientSession.clientSessionId)).size).toBe(1);
  const switched = await open(api, root.observation, "client-a", "custom_sso");
  expect(switched.clientSession.clientSessionId).toBe(child.clientSession.clientSessionId);
  expect(switched.clientSession.protocol).toBe("custom_sso");
  expect(switched.clientSession.expiresAt).toBeGreaterThanOrEqual(child.clientSession.expiresAt);
  const observed = await api.resolveClientSessionForUse(target(child));
  expect(observed.status).toBe("resolved");
  expect(oldLifetime.expiresAt - oldLifetime.issuedAt).toBe(600000);
  expect(api.useObservation(child).clientSession?.expiresAt).toBe(child.clientSession.expiresAt);
  const rootAgain = await api.resolveUserSession(root.bearer);
  if (rootAgain.status !== "resolved")
    throw new Error("Root missing");
  expect(rootAgain.value.userSession).toEqual(root.observation.userSession);
  const snapshot = await api.captureSessions({
    scope: { userSessionId: root.observation.userSession.userSessionId },
  });
  expect(snapshot.records).toHaveLength(1);
  const inspected = await scope.inspect(snapshot.targets[0]!);
  expect(inspected.expiresAt).toBe(inspected.relatedExpiresAt);
});

test("root ceiling and monotonic child lifetime survive different process TTLs and application clock jumps", async () => {
  const { root, child } = await fixture();
  const clock = spyOn(Date, "now");
  try {
    for (const offset of [-86400000, 86400000, -3600000, 3600000]) {
      clock.mockReturnValue(root.observation.observedAt + offset);
      const op = operation(scope.createFactory({ clientSessionTtlSeconds: 7200 }));
      const resolved = await op.api.resolveUserSession(root.bearer);
      if (resolved.status !== "resolved")
        throw new Error("Clock skew invalidated root");
      const renewed = await open(op.api, resolved.value);
      expect(renewed.clientSession.expiresAt).toBe(root.observation.userSession.expiresAt);
      expect(renewed.observedAt - root.observation.observedAt).toBeLessThan(10000);
      const short = operation(scope.createFactory({ clientSessionTtlSeconds: 1 }));
      const shortRoot = await short.api.resolveUserSession(root.bearer);
      if (shortRoot.status !== "resolved")
        throw new Error("Root missing");
      const preserved = await open(short.api, shortRoot.value);
      expect(preserved.clientSession.expiresAt).toBe(renewed.clientSession.expiresAt);
      expect(preserved.clientSession.clientSessionId).toBe(child.clientSession.clientSessionId);
      const lifetime = await op.api.getIssuanceLifetime(renewed, 7200);
      expect(lifetime.expiresAt).toBe(root.observation.userSession.expiresAt);
      expect(lifetime.remainingSeconds).toBeLessThanOrEqual(3600);
    }
  }
  finally {
    clock.mockRestore();
  }
});

test("independent root and client TTLs preserve 24h versus 1h and clip issuance and short-root relationships", async () => {
  const longRoot = operation(
    scope.createFactory({ userSessionTtlSeconds: 86400, clientSessionTtlSeconds: 3600 }),
  );
  const root = await longRoot.api.createUserSession(authentication);
  const child = await open(longRoot.api, root.observation);
  expect(root.observation.userSession.expiresAt - root.observation.userSession.createdAt).toBe(86400000);
  expect(child.clientSession.expiresAt - child.observedAt).toBe(3600000);
  expect(child.clientSession.expiresAt).toBeLessThan(root.observation.userSession.expiresAt);
  const lifetime = await longRoot.api.getIssuanceLifetime(child, 7200);
  expect(lifetime.expiresAt).toBe(child.clientSession.expiresAt);

  const shortRoot = operation(
    scope.createFactory({ userSessionTtlSeconds: 30, clientSessionTtlSeconds: 3600 }),
  );
  const short = await shortRoot.api.createUserSession(authentication);
  const clipped = await open(shortRoot.api, short.observation);
  expect(clipped.clientSession.expiresAt).toBe(short.observation.userSession.expiresAt);
});

test("observations reject copies, serialization, cross operation/factory, management DTOs and completed scopes; nested mutation cannot change private facts", async () => {
  const { api, root, child, close, operation: scopeOperation } = await fixture();
  const other = operation();
  const otherFactory = scope.createFactory().forOperation(scopeOperation);
  const copies = [
    { ...root.observation },
    structuredClone(root.observation),
    JSON.parse(JSON.stringify(root.observation)),
  ];
  for (const copy of copies) {
    const error = await rejection(() => open(api, copy));
    expect(error).toBeInstanceOf(SessionObservationRequiredError);
  }
  const errors = await Promise.all([
    rejection(() => open(other.api, root.observation)),
    rejection(() => open(otherFactory, root.observation)),
    rejection(() =>
      api.openClientSession(child as unknown as UserSessionObservation, {
        clientId: "fake",
        protocol: "oidc",
      }),
    ),
  ]);
  expect(errors.every(error => error instanceof SessionObservationRequiredError)).toBe(true);
  expect(Reflect.set(root.observation.userSession, "subjectContext", "changed")).toBe(false);
  expect(Reflect.set(root.observation.userSession.amr, "0", "fake")).toBe(false);
  expect(Reflect.set(root.observation.userSession.origin!, "ip", "fake")).toBe(false);
  expect(api.useObservation(root.observation).userSession).toMatchObject(authentication);
  const inventory = await api.captureSessions({ scope: { subjectIdentifier } });
  const dtoError = await rejection(() =>
    open(api, inventory.records[0] as unknown as UserSessionObservation),
  );
  expect(dtoError).toBeInstanceOf(SessionObservationRequiredError);
  const count = await scope.countRecords();
  expect(count).toBe(2);
  close();
  const closedError = await rejection(() => api.useObservation(child));
  expect(closedError).toBeInstanceOf(SessionObservationRequiredError);
  const closedOpen = await rejection(() => open(api, root.observation));
  expect(closedOpen).toBeInstanceOf(SessionObservationRequiredError);
});

test("closing while Redis is in flight refuses the late observation without claiming mutation cancellation", async () => {
  const op = operation();
  scope.afterNext("create", async () => {
    op.close();
  });
  const error = await rejection(() => op.api.createUserSession(authentication));
  expect(error).toBeInstanceOf(SessionObservationRequiredError);
  const inventory = await operation().api.captureSessions({ scope: { subjectIdentifier } });
  expect(inventory.records).toHaveLength(1);
});

test("root termination denies new online combinations even with missing child indexes; acquired observations and late writes retain their in-flight boundary", async () => {
  const { api, root, child } = await fixture();
  await scope.forgetChildIndex(root.observation.userSession.userSessionId);
  const result = await api.revokeObservedUserSession(root.observation);
  expect(result.status).toBe("terminated");
  const newRequest = operation();
  const denied = await newRequest.api.resolveClientSessionForUse(target(child));
  expect(denied.status).toBe("terminated");
  expect(api.useObservation(child).clientSession?.clientSessionId).toBe(child.clientSession.clientSessionId);
  const late = await open(api, root.observation, "client-late");
  const lateDenied = await newRequest.api.resolveClientSessionForUse(target(late));
  expect(lateDenied.status).toBe("terminated");
  const neutral = await newRequest.api.observeClientSessionForRevocation(target(child));
  if (neutral.status !== "resolved")
    throw new Error("Neutral revocation required live parent");
  const revoked = await newRequest.api.revokeObservedClientSession(neutral.value);
  expect(revoked.status).toBe("terminated");
});

test("online observation checks the exact root, instance and Client; relationship replacement never rebinds old references", async () => {
  const { api, root, child } = await fixture();
  const otherRoot = await api.createUserSession(authentication);
  const other = await open(api, otherRoot.observation);
  const otherClient = await open(api, root.observation, "client-b");
  const wrongRoot = await api.resolveClientSessionForUse({
    ...target(child),
    userSessionId: otherRoot.observation.userSession.userSessionId,
  });
  const wrongClient = await api.resolveClientSessionForUse({ ...target(child), clientId: "client-b" });
  expect(wrongRoot.status).toBe("mismatch");
  expect(wrongClient.status).toBe("mismatch");
  const revoked = await api.revokeObservedClientSession(child);
  expect(revoked.status).toBe("terminated");
  const replacement = await open(api, root.observation);
  expect(replacement.clientSession.clientSessionId).not.toBe(child.clientSession.clientSessionId);
  const oldUse = await api.resolveClientSessionForUse(target(child));
  expect(oldUse.status).toBe("terminated");
  const retry = await api.revokeObservedClientSession(child);
  expect(retry.status).toBe("already_terminated");
  for (const retained of [replacement, other, otherClient]) {
    const observed = await api.resolveClientSessionForUse(target(retained));
    expect(observed.status).toBe("resolved");
  }
});

test("stable captured identity revokes after legitimate renewal and protocol change but preserves same-ID replacement", async () => {
  const { api, root, child } = await fixture();
  const captured = await api.captureSessions({
    scope: { userSessionId: root.observation.userSession.userSessionId },
  });
  await open(api, root.observation, "client-a", "custom_sso");
  const revoked = await api.executeCapturedSessions({ targets: captured.targets });
  expect(revoked.clientSessionsTerminated).toBe(1);
  const fresh = await open(api, root.observation);
  const freshCapture = await api.captureSessions({
    scope: { userSessionId: root.observation.userSession.userSessionId },
  });
  const replacement = await scope.replaceInstance(freshCapture.targets[0]!);
  const stale = await api.executeCapturedSessions({ targets: freshCapture.targets });
  expect(stale.results[0]?.status).toBe("replaced");
  const retained = await scope.inspect(freshCapture.targets[0]!);
  expect(retained.record).toEqual(replacement);
  expect(fresh.clientSession.clientSessionId).not.toBe(child.clientSession.clientSessionId);
});

test("fixed batch excludes only the current root and returns only failed/unknown original identities for explicit retries", async () => {
  const { api, root, child } = await fixture();
  const roots = await api.captureSessions({ scope: { subjectIdentifier } });
  const children = await api.captureSessions({
    scope: { userSessionId: root.observation.userSession.userSessionId },
  });
  const newer = await open(api, root.observation, "client-new");
  scope.failNext("revoke");
  const first = await api.executeCapturedSessions({
    targets: [...roots.targets, ...children.targets],
    excludeUserSessionId: root.observation.userSession.userSessionId,
  });
  expect(first.results.map(r => r.status)).toEqual(["excluded", "unknown"]);
  expect(first.clientSessionsTerminated).toBe(0);
  expect(first.unfinished).toEqual(children.targets);
  const retry = await operation().api.executeCapturedSessions({ targets: structuredClone(first.unfinished) });
  expect(retry.clientSessionsTerminated).toBe(1);
  expect(retry.unfinished).toEqual([]);
  const next = await api.resolveClientSessionForUse(target(newer));
  const currentRoot = await api.resolveUserSession(root.bearer);
  const old = await api.resolveClientSessionForUse(target(child));
  expect(next.status).toBe("resolved");
  expect(currentRoot.status).toBe("resolved");
  expect(old.status).toBe("terminated");
});

test("lost revocation reply stays unknown despite an actual terminal state, and retry reports no new effect", async () => {
  const { api, child } = await fixture();
  scope.failNext("revoke", true);
  const lost = await api.revokeObservedClientSession(child);
  expect(lost.status).toBe("unknown");
  const inspected = await scope.inspect(lost.target);
  expect(inspected.record?.state).toBe("terminated");
  const retried = await api.executeCapturedSessions({ targets: [lost.target] });
  expect(retried.results[0]?.status).toBe("already_terminated");
  expect(retried.clientSessionsTerminated).toBe(0);
});

for (const outcome of ["success", "failed", "unknown-before", "unknown-after"] as const) {
  test(`neutral revocation result cannot redirect its private target after ${outcome}`, async () => {
    const { api, root, child } = await fixture();
    const second = await open(api, root.observation, "client-b");
    const captured = await api.captureSessions({
      scope: { userSessionId: root.observation.userSession.userSessionId },
    });
    const originalTarget = captured.targets.find(
      value => value.id === child.clientSession.clientSessionId,
    )!;
    const secondTarget = captured.targets.find(value => value.id === second.clientSession.clientSessionId)!;
    const neutral = await api.observeClientSessionForRevocation(target(child));
    if (neutral.status !== "resolved")
      throw new Error("Neutral observation missing");
    const restore = outcome === "failed" ? await scope.corruptRecord(originalTarget) : undefined;
    if (outcome.startsWith("unknown"))
      scope.failNext("revoke", outcome === "unknown-after");
    const first = await api.revokeObservedClientSession(neutral.value);
    expect(first.status).toBe(
      outcome === "success" ? "terminated" : outcome === "failed" ? "failed" : "unknown",
    );
    // A frozen result may reject mutation; either way the original observation must remain authoritative.
    await rejection(() => Object.assign(first.target, secondTarget));
    if (restore)
      await restore();
    const retry = await api.revokeObservedClientSession(neutral.value);
    const originalState = await scope.inspect(originalTarget);
    const retainedState = await scope.inspect(secondTarget);
    const retainedOnline = await api.resolveClientSessionForUse(target(second));
    expect(retry.target).toEqual(originalTarget);
    expect(retry.status).toBe(
      outcome === "success" || outcome === "unknown-after" ? "already_terminated" : "terminated",
    );
    expect(originalState.record?.state).toBe("terminated");
    expect(retainedState.record?.state).toBe("active");
    expect(retainedOnline.status).toBe("resolved");
  });
}

test("missing, already terminated, corrupt and unknown targets remain distinct and do not widen a batch", async () => {
  const { api, root, child } = await fixture();
  const second = await open(api, root.observation, "client-b");
  const third = await open(api, root.observation, "client-c");
  const page = await api.captureSessions({
    scope: { userSessionId: root.observation.userSession.userSessionId },
  });
  const childTarget = page.targets.find(t => t.id === child.clientSession.clientSessionId)!;
  const secondTarget = page.targets.find(t => t.id === second.clientSession.clientSessionId)!;
  await scope.removeRecord(childTarget);
  await scope.corruptRecord(secondTarget);
  await api.revokeObservedClientSession(third);
  const result = await api.executeCapturedSessions({ targets: page.targets });
  expect(result.results.map(r => r.status).sort()).toEqual(["already_terminated", "failed", "missing"]);
  expect(result.unfinished).toEqual([secondTarget]);
  expect(result.userSessionsTerminated + result.clientSessionsTerminated).toBe(0);
});

test("terminal state and reverse ID keep their deadline when pure index reclamation fails", async () => {
  const { api, root, child } = await fixture();
  const roots = await api.captureSessions({ scope: { subjectIdentifier } });
  const children = await api.captureSessions({
    scope: { userSessionId: root.observation.userSession.userSessionId },
  });
  await scope.corruptReclamationIndex(roots.targets[0]!);
  await scope.corruptReclamationIndex(children.targets[0]!);
  const childRevoke = await api.revokeObservedClientSession(child);
  const rootRevoke = await api.revokeObservedUserSession(root.observation);
  expect([childRevoke.status, rootRevoke.status]).toEqual(["terminated", "terminated"]);
  const rootState = await scope.inspect(rootRevoke.target);
  const childState = await scope.inspect(childRevoke.target);
  expect(rootState.expiresAt).toBe(root.observation.userSession.expiresAt);
  expect(rootState.relatedExpiresAt).toBe(rootState.expiresAt);
  expect(childState.expiresAt).toBe(child.clientSession.expiresAt);
  expect(childState.relatedValue).toBeNull();
});

test("expired client instances are never reopened and expired roots/IDs disappear together", async () => {
  const op = operation(scope.createFactory({ userSessionTtlSeconds: 3, clientSessionTtlSeconds: 1 }));
  const root = await op.api.createUserSession(authentication);
  const old = await open(op.api, root.observation);
  await Bun.sleep(1100);
  const fresh = await open(op.api, root.observation);
  expect(fresh.clientSession.clientSessionId).not.toBe(old.clientSession.clientSessionId);
  const oldUse = await op.api.resolveClientSessionForUse(target(old));
  expect(oldUse.status).toBe("missing");
  await Bun.sleep(2000);
  const byBearer = await op.api.resolveUserSession(root.bearer);
  const byId = await op.api.resolveUserSessionById(root.observation.userSession.userSessionId);
  const afterRoot = await op.api.openClientSession(root.observation, { clientId: "late", protocol: "oidc" });
  expect(byBearer.status).toBe("missing");
  expect(byId.status).toBe("missing");
  expect(afterRoot.status).toBe("expired");
});

test("read transport failures remain unavailable rather than missing, and neutral records cannot become parent observations", async () => {
  const { api, root, child } = await fixture();
  scope.failNext("resolveClient");
  const error = await rejection(() => api.resolveClientSessionForUse(target(child)));
  expect(error).toBeInstanceOf(SessionStorageError);
  const neutral = await api.observeUserSessionForRevocation(root.observation.userSession.userSessionId);
  if (neutral.status !== "resolved")
    throw new Error("Neutral observation missing");
  const misuse = await rejection(() => open(api, neutral.value as unknown as UserSessionObservation));
  expect(misuse).toBeInstanceOf(SessionObservationRequiredError);
  const wrong = await api.observeClientSessionForRevocation({ ...target(child), clientId: "other" });
  expect(wrong.status).toBe("mismatch");
});

test("capture pages preserve Client scope and deduplicate explicit identities without including later instances", async () => {
  const { api, root } = await fixture();
  const secondRoot = await api.createUserSession(authentication);
  await open(api, secondRoot.observation);
  await open(api, root.observation, "other-client");
  const first = await api.captureSessions({ scope: { clientId: "client-a" }, limit: 1 });
  expect(first.nextOffset).toBe(1);
  const second = await api.captureSessions({
    scope: { clientId: "client-a" },
    offset: first.nextOffset!,
    limit: 2,
  });
  expect(second.nextOffset).toBeNull();
  expect([...first.records, ...second.records]).toHaveLength(2);
  const captured = [...first.targets, ...second.targets, ...first.targets];
  const result = await api.executeCapturedSessions({ targets: captured });
  expect(result.clientSessionsTerminated).toBe(2);
  expect(result.results).toHaveLength(2);
  const retained = await api.captureSessions({ scope: { clientId: "other-client" } });
  expect(retained.records).toHaveLength(1);
});
