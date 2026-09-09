import type { SessionKernelRedisTestScope } from "./redis-test-harness";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { createRedisTestHarness } from "./redis-test-harness";

let harness: Awaited<ReturnType<typeof createRedisTestHarness>>;
let scope: SessionKernelRedisTestScope;
let logs: Record<string, unknown>[];
beforeAll(async () => {
  harness = await createRedisTestHarness();
});
beforeEach(async () => {
  logs = [];
  scope = await harness.createSessionKernelScope({
    logger: { warn: data => logs.push(data) },
    cleanupAdapters: [{ protocol: "test", kind: "payload", async cleanup() {} }],
  });
});
afterEach(async () => {
  await scope.close();
});
afterAll(async () => {
  await harness.close();
});

async function fixture() {
  const root = await scope.writer.createPrincipalSession("00000000-0000-4000-8000-000000000001", { subjectContext: "generation" });
  if (root.status !== "created")
    throw new Error("root fixture failed");
  const tokens: string[] = [];
  for (let index = 0; index < 2; index++) {
    const child = await scope.writer.issueCredential({
      principalSessionId: root.value.principalSessionId,
      protocol: "test",
      clientCode: "client",
      credentialType: "access",
      cleanupRefs: [{ protocol: "test", kind: "payload", ref: `payload-${index}` }],
    });
    if (child.status !== "created" || !child.externalToken)
      throw new Error("child fixture failed");
    tokens.push(child.externalToken);
  }
  return { root: root.value, tokens };
}

for (const fault of ["enumeration", "child", "comparison", "cleanup"] as const) {
  test(`root completes after ${fault} failure and counts only actual transitions`, async () => {
    const f = await fixture();
    if (fault === "enumeration")
      scope.failNextChildIndexRead();
    if (fault === "child")
      scope.failNextChildRevoke();
    if (fault === "comparison")
      scope.replaceObjectBeforeNextRevoke();
    if (fault === "cleanup")
      scope.failNextCleanupFinalize();
    const summary = await scope.writer.revokePrincipalSession(f.root.principalSessionId);
    const root = await scope.observer.resolvePrincipalSessionById(f.root.principalSessionId);
    const children = await Promise.all(f.tokens.map(token => scope.observer.resolveCredential(token, { protocol: "test", credentialType: "access" })));
    expect(root.status).toBe("revoked");
    expect(summary.principalSessions.revoked).toBe(1);
    const expected = fault === "enumeration" ? 0 : fault === "cleanup" ? 2 : 1;
    expect(summary.credentials.revoked).toBe(expected);
    expect(children.filter(child => child.status === "revoked")).toHaveLength(expected);
    expect(summary.cleanup.failed).toBe(fault === "cleanup" ? 1 : 0);
    const retry = await scope.writer.revokePrincipalSession(f.root.principalSessionId);
    expect(retry.principalSessions.revoked).toBe(0);
    expect(retry.credentials.revoked).toBe(2 - expected);
    expect(JSON.stringify(logs)).not.toContain("payload-");
    expect(JSON.stringify(logs)).not.toContain(f.tokens[0]);
  });
}

test("root failure preserves completed children and still attempts another user root", async () => {
  const first = await fixture();
  const second = await fixture();
  scope.failNextPrincipalRevoke();
  let failure: unknown;
  try {
    await scope.writer.revokeUserSessionRecords({ principalType: "user", subjectId: "00000000-0000-4000-8000-000000000001" });
  }
  catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(AggregateError);
  const roots = await Promise.all([first, second].map(f => scope.observer.resolvePrincipalSessionById(f.root.principalSessionId)));
  const children = await Promise.all([...first.tokens, ...second.tokens].map(token => scope.observer.resolveCredential(token, { protocol: "test", credentialType: "access" })));
  expect(roots.filter(root => root.status === "revoked")).toHaveLength(1);
  expect(children.every(child => child.status === "revoked")).toBe(true);
});

test("root comparison conflict cannot be reported as a successful missing root", async () => {
  const root = await scope.writer.createPrincipalSession("00000000-0000-4000-8000-000000000001", { subjectContext: "generation" });
  if (root.status !== "created")
    throw new Error("fixture failed");
  scope.replaceObjectBeforeNextRevoke();
  let failure: unknown;
  try {
    await scope.writer.revokePrincipalSession(root.value.principalSessionId);
  }
  catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  const observed = await scope.observer.resolvePrincipalSessionById(root.value.principalSessionId);
  expect(observed.status).toBe("resolved");
});

test("a lost root response reports failure while the independently observed effects remain", async () => {
  const f = await fixture();
  scope.failNextPrincipalRevokeAfterCommit();
  let failure: unknown;
  try {
    await scope.writer.revokePrincipalSession(f.root.principalSessionId);
  }
  catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  const root = await scope.observer.resolvePrincipalSessionById(f.root.principalSessionId);
  expect(root.status).toBe("revoked");
  const retry = await scope.writer.revokePrincipalSession(f.root.principalSessionId);
  expect(retry.principalSessions.revoked + retry.credentials.revoked).toBe(0);
});

test("a root replaced after generation selection preserves the new generation and its children", async () => {
  const f = await fixture();
  const pause = scope.pauseNextLifecycleObservation();
  const pending = scope.writer.revokeUserSessionsByContext(f.root.principal, "user_disabled", ["generation"]);
  await pause.reached;
  await scope.seedPrincipalPayload(f.root.principalSessionId, JSON.stringify({ ...f.root, subjectContext: "new-generation" }));
  const fresh = await scope.observer.issueCredential({ principalSessionId: f.root.principalSessionId, protocol: "test", clientCode: "new-client", credentialType: "access" });
  if (fresh.status !== "created" || !fresh.externalToken)
    throw new Error("new generation fixture failed");
  pause.release();
  let failure: unknown;
  try {
    await pending;
  }
  catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(AggregateError);
  const root = await scope.observer.resolvePrincipalSessionById(f.root.principalSessionId);
  const child = await scope.observer.resolveCredential(fresh.externalToken, { protocol: "test", credentialType: "access" });
  expect(root).toMatchObject({ status: "resolved", value: { subjectContext: "new-generation" } });
  expect(child.status).toBe("resolved");
});

test("keeping the current root changes children only and preserves a foreign user", async () => {
  const f = await fixture();
  const foreign = await scope.writer.createPrincipalSession("00000000-0000-4000-8000-000000000099", { subjectContext: "generation" });
  if (foreign.status !== "created")
    throw new Error("fixture failed");
  const summary = await scope.writer.revokeUserSessionRecords({ principalType: "user", subjectId: "00000000-0000-4000-8000-000000000001" }, "admin_revoke", { exceptPrincipalSessionId: f.root.principalSessionId });
  expect(summary.principalSessions.revoked).toBe(0);
  expect(summary.principalSessions.excluded).toBe(1);
  expect(summary.credentials.revoked).toBe(2);
  const current = await scope.observer.resolvePrincipalSessionById(f.root.principalSessionId);
  const other = await scope.observer.resolvePrincipalSessionById(foreign.value.principalSessionId);
  expect(current.status).toBe("resolved");
  expect(other.status).toBe("resolved");
});

test("an invalid root observation cannot be repaired by rereading a newly written generation", async () => {
  const f = await fixture();
  await scope.seedPrincipalPayload(f.root.principalSessionId, "{}");
  const pause = scope.pauseNextLifecycleObservation();
  const pending = scope.writer.revokeUserSessionRecords(f.root.principal);
  await pause.reached;
  await scope.seedPrincipalPayload(f.root.principalSessionId, JSON.stringify({ ...f.root, subjectContext: "new-generation" }));
  pause.release();
  let failure: unknown;
  try {
    await pending;
  }
  catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  const root = await scope.observer.resolvePrincipalSessionById(f.root.principalSessionId);
  expect(root).toMatchObject({ status: "resolved", value: { subjectContext: "new-generation" } });
  const children = await Promise.all(f.tokens.map(token => scope.observer.resolveCredential(token, { protocol: "test", credentialType: "access" })));
  expect(children.every(child => child.status === "resolved")).toBe(true);
});
