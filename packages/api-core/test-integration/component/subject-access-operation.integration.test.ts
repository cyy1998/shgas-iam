import type { SubjectAccessOperationBarrierPort, SubjectAccessOperationRevocationPort } from "../../src/subject-access";
import { describe, expect, mock, test } from "bun:test";
import { createSubjectAccessOperations, encodeSubjectAccessContext, parseSubjectAccessContext, requireSubjectAccessOperation, SubjectAccessDisabledError, SubjectAccessOperationDeniedError, SubjectAccessPermissionRequiredError, SubjectAccessUnavailableError } from "../../src/subject-access";

type Assert<T extends true> = T;
export type BarrierCompatibility = Assert<ReturnType<typeof import("../../src/subject-access").createSubjectAccessBarrier> extends SubjectAccessOperationBarrierPort ? true : false>;
export type RevocationCompatibility = Assert<ReturnType<typeof import("../../src/subject-access").createUnifiedSubjectAccessSessionRevocation> extends SubjectAccessOperationRevocationPort ? true : false>;
const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const otherSubject = "00000000-0000-4000-8000-000000000002";
const generation = "10000000-0000-4000-8000-000000000001";
const nextGeneration = "10000000-0000-4000-8000-000000000002";
const principalSessionId = "20000000-0000-4000-8000-000000000001";
function persisted(transitionId = generation, subject = subjectIdentifier) {
  return encodeSubjectAccessContext({ version: 1, subjectIdentifier: subject, transitionId });
}
function session(subjectContext: unknown = persisted()) {
  return { subjectIdentifier, subjectContext, principalSessionId };
}
function summary(): import("../../src/subject-access").UnifiedSessionRevocationSummary {
  return { userSessionsTerminated: 0, clientSessionsTerminated: 0, results: [], unfinished: [] };
}
function setup() {
  const barrier = { readCommittedTransitionId: mock(async (_subject: string) => generation) };
  const revocation = {
    revokePrincipalSession: mock(async (_id: string, _reason: "session_generation_stale") => summary()),
    revokeUserSessions: mock(async (_principal: {
      principalType: "user";
      subjectId: string;
    }, _reason: "user_disabled", _options: {
      onlySubjectAccessTransitionId: string;
    }) => summary()),
  };
  return { ...createSubjectAccessOperations({ barrier, revocation }), barrier, revocation };
}
async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected operation to reject");
}
describe("Subject Access operation permissions", () => {
  test("shares the pending check and reuses its permission for authentication and matching sessions", async () => {
    const fixture = setup();
    const gate = Promise.withResolvers<string>();
    fixture.barrier.readCommittedTransitionId.mockImplementation(() => gate.promise);
    const operation = fixture.createOperation();
    const first = operation.acquireForAuthentication(subjectIdentifier);
    const second = operation.acquireForSession(session());
    expect(fixture.barrier.readCommittedTransitionId).toHaveBeenCalledTimes(1);
    expect(() => operation.requirePermission(subjectIdentifier)).toThrow(SubjectAccessPermissionRequiredError);
    gate.resolve(generation);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(operation.requirePermission(subjectIdentifier)).toBe(a);
    expect(operation.getSubjectContext(a)).toBe(persisted());
    const third = await operation.acquireForSession({ ...session(), principalSessionId: crypto.randomUUID() });
    expect(third).toBe(a);
    expect(fixture.barrier.readCommittedTransitionId).toHaveBeenCalledTimes(1);
  });
  test("keeps admitted work on its original generation and checks each new operation", async () => {
    const fixture = setup();
    const operation = fixture.createOperation();
    const permission = await operation.acquireForSession(session());
    fixture.barrier.readCommittedTransitionId.mockRejectedValue(new SubjectAccessDisabledError());
    const repeated = await operation.acquireForSession(session());
    expect(repeated).toBe(permission);
    expect(operation.getSubjectContext(permission)).toBe(persisted());
    const denied = await failure(fixture.createOperation().acquireForSession(session()));
    expect(denied).toMatchObject({ reason: "user_disabled" });
    fixture.barrier.readCommittedTransitionId.mockResolvedValue(nextGeneration);
    const login = fixture.createOperation();
    const fresh = await login.acquireForAuthentication(subjectIdentifier);
    expect(login.getSubjectContext(fresh)).toBe(persisted(nextGeneration));
    expect(operation.getSubjectContext(permission)).toBe(persisted());
    expect(fixture.barrier.readCommittedTransitionId).toHaveBeenCalledTimes(3);
  });
  test.each(["disabled", "unavailable", "redis failure"])("fixes %s failures including parallel retries", async (kind) => {
    const fixture = setup();
    const cause = kind === "disabled"
      ? new SubjectAccessDisabledError()
      : kind === "unavailable" ? new SubjectAccessUnavailableError() : new Error("Redis disconnected");
    const gate = Promise.withResolvers<string>();
    fixture.barrier.readCommittedTransitionId.mockImplementation(() => gate.promise);
    const operation = fixture.createOperation();
    const first = failure(operation.acquireForSession(session()));
    const second = failure(operation.acquireForSession(session()));
    gate.reject(cause);
    const [a, b] = await Promise.all([first, second]);
    fixture.barrier.readCommittedTransitionId.mockResolvedValue(generation);
    const retry = await failure(operation.acquireForSession(session()));
    expect(b).toBe(a);
    expect(retry).toBe(a);
    expect(a).toBeInstanceOf(kind === "disabled" ? SubjectAccessDisabledError : SubjectAccessUnavailableError);
    expect(fixture.barrier.readCommittedTransitionId).toHaveBeenCalledTimes(1);
    expect(fixture.revocation.revokeUserSessions).toHaveBeenCalledTimes(kind === "disabled" ? 1 : 0);
    expect(fixture.revocation.revokePrincipalSession).not.toHaveBeenCalled();
  });
  test("rejects a different subject while pending without reading its barrier", async () => {
    const fixture = setup();
    const gate = Promise.withResolvers<string>();
    fixture.barrier.readCommittedTransitionId.mockImplementation(() => gate.promise);
    const operation = fixture.createOperation();
    const first = operation.acquireForAuthentication(subjectIdentifier);
    const mismatch = await failure(operation.acquireForAuthentication(otherSubject));
    expect(mismatch).toMatchObject({ reason: "identity_mismatch" });
    gate.resolve(generation);
    await first;
    expect(fixture.barrier.readCommittedTransitionId).toHaveBeenCalledTimes(1);
  });
  test("does not switch subject or generation after the first failure", async () => {
    const fixture = setup();
    fixture.barrier.readCommittedTransitionId.mockRejectedValue(new SubjectAccessUnavailableError());
    const operation = fixture.createOperation();
    await failure(operation.acquireForSession(session()));
    const differentSubject = await failure(operation.acquireForAuthentication(otherSubject));
    const differentGeneration = await failure(operation.acquireForSession(session(persisted(nextGeneration))));
    expect(differentSubject).toMatchObject({ reason: "identity_mismatch" });
    expect(differentGeneration).toMatchObject({ reason: "identity_mismatch" });
    expect(fixture.barrier.readCommittedTransitionId).toHaveBeenCalledTimes(1);
    expect(fixture.revocation.revokeUserSessions).not.toHaveBeenCalled();
    expect(fixture.revocation.revokePrincipalSession).not.toHaveBeenCalled();
  });
  test("binds both context subject and generation without rechecking or revoking unrelated objects", async () => {
    const fixture = setup();
    const operation = fixture.createOperation();
    await operation.acquireForSession(session());
    for (const target of [session(persisted(nextGeneration)), session(persisted(generation, otherSubject))]) {
      const error = await failure(operation.acquireForSession(target));
      expect(error).toMatchObject({ reason: "identity_mismatch" });
    }
    expect(() => operation.requirePermission(otherSubject)).toThrow(SubjectAccessOperationDeniedError);
    expect(fixture.barrier.readCommittedTransitionId).toHaveBeenCalledTimes(1);
    expect(fixture.revocation.revokeUserSessions).not.toHaveBeenCalled();
    expect(fixture.revocation.revokePrincipalSession).not.toHaveBeenCalled();
  });
  test("rejects a known different generation immediately while the check is pending", async () => {
    const fixture = setup();
    const gate = Promise.withResolvers<string>();
    fixture.barrier.readCommittedTransitionId.mockImplementation(() => gate.promise);
    const operation = fixture.createOperation();
    const first = operation.acquireForSession(session());
    const mismatch = await failure(operation.acquireForSession(session(persisted(nextGeneration))));
    expect(mismatch).toMatchObject({ reason: "identity_mismatch" });
    gate.resolve(generation);
    await first;
    expect(fixture.barrier.readCommittedTransitionId).toHaveBeenCalledTimes(1);
  });
  test.each([undefined, null, "not json", "{}", persisted().replace("\"version\":1", "\"version\":2"), persisted().replace(generation, "broken"), persisted().replace("}", ",\"allowed\":true}")])("does not repair malformed context %j from the current barrier", async (context) => {
    const fixture = setup();
    const operation = fixture.createOperation();
    const target = { ...session(), subjectContext: context };
    const error = await failure(operation.acquireForSession(target));
    const retry = await failure(operation.acquireForAuthentication(subjectIdentifier));
    expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
    expect(retry).toBe(error);
    expect(fixture.barrier.readCommittedTransitionId).not.toHaveBeenCalled();
    expect(fixture.revocation.revokeUserSessions).not.toHaveBeenCalled();
    expect(fixture.revocation.revokePrincipalSession).not.toHaveBeenCalled();
  });
  test("rejects context for another subject before accessing the barrier", async () => {
    const fixture = setup();
    const target = session(persisted(generation, otherSubject));
    const error = await failure(fixture.createOperation().acquireForSession(target));
    expect(error).toMatchObject({ reason: "identity_mismatch" });
    expect(fixture.barrier.readCommittedTransitionId).not.toHaveBeenCalled();
  });
  test("revokes only the stale root and fixes the denial even when cleanup throws", async () => {
    const fixture = setup();
    fixture.barrier.readCommittedTransitionId.mockResolvedValue(nextGeneration);
    const cleanupError = new Error("cleanup unavailable");
    fixture.revocation.revokePrincipalSession.mockRejectedValue(cleanupError);
    const operation = fixture.createOperation();
    const error = await failure(operation.acquireForSession(session()));
    const retry = await failure(operation.acquireForSession(session()));
    expect(error).toMatchObject({ reason: "session_generation_stale", cause: cleanupError });
    expect(retry).toBe(error);
    expect(fixture.revocation.revokePrincipalSession).toHaveBeenCalledTimes(1);
    expect(fixture.revocation.revokePrincipalSession).toHaveBeenCalledWith(principalSessionId, "session_generation_stale");
    expect(fixture.revocation.revokeUserSessions).not.toHaveBeenCalled();
  });
  test("late disabled cleanup targets the credential generation and preserves denial on partial cleanup", async () => {
    const fixture = setup();
    const cleanup = Promise.withResolvers<ReturnType<typeof summary>>();
    fixture.barrier.readCommittedTransitionId.mockRejectedValue(new SubjectAccessDisabledError());
    fixture.revocation.revokeUserSessions.mockImplementation(() => cleanup.promise);
    const operation = fixture.createOperation();
    const denied = failure(operation.acquireForSession(session()));
    // The new login can finish while the previous operation is waiting for cleanup.
    fixture.barrier.readCommittedTransitionId.mockResolvedValue(nextGeneration);
    const login = fixture.createOperation();
    const fresh = await login.acquireForAuthentication(subjectIdentifier);
    const partial = summary();
    const target = { kind: "userSession" as const, id: principalSessionId, instance: principalSessionId, userSessionId: principalSessionId, subjectIdentifier };
    partial.results.push({ target, status: "failed" });
    partial.unfinished.push(target);
    cleanup.resolve(partial);
    const error = await denied;
    expect(error).toMatchObject({ reason: "user_disabled", revokeSummary: partial });
    expect(fixture.revocation.revokeUserSessions).toHaveBeenCalledTimes(1);
    expect(fixture.revocation.revokeUserSessions).toHaveBeenCalledWith({ principalType: "user", subjectId: subjectIdentifier }, "user_disabled", { onlySubjectAccessTransitionId: generation });
    expect(login.getSubjectContext(fresh)).toBe(persisted(nextGeneration));
  });
  test("disabled authentication has no existing generation to revoke", async () => {
    const fixture = setup();
    fixture.barrier.readCommittedTransitionId.mockRejectedValue(new SubjectAccessDisabledError());
    const error = await failure(fixture.createOperation().acquireForAuthentication(subjectIdentifier));
    expect(error).toMatchObject({ reason: "user_disabled" });
    expect(fixture.revocation.revokeUserSessions).not.toHaveBeenCalled();
  });
  test("missing and forged containers or permissions cannot authorize work", async () => {
    const fixture = setup();
    const operation = fixture.createOperation();
    expect(() => requireSubjectAccessOperation(undefined)).toThrow(SubjectAccessPermissionRequiredError);
    expect(() => requireSubjectAccessOperation({ ...operation })).toThrow(SubjectAccessPermissionRequiredError);
    expect(() => operation.requirePermission(subjectIdentifier)).toThrow(SubjectAccessPermissionRequiredError);
    const permission = await operation.acquireForAuthentication(subjectIdentifier);
    expect(() => operation.getSubjectContext({ ...permission })).toThrow(SubjectAccessPermissionRequiredError);
    const other = fixture.createOperation();
    await other.acquireForAuthentication(subjectIdentifier);
    expect(() => other.getSubjectContext(permission)).toThrow(SubjectAccessPermissionRequiredError);
    expect(JSON.stringify(permission)).toBe("{}");
  });
  test("closes an admitted operation and rejects pending acquisition after close", async () => {
    const fixture = setup();
    const operation = fixture.createOperation();
    const permission = await operation.acquireForAuthentication(subjectIdentifier);
    operation.close();
    operation.close();
    expect(() => requireSubjectAccessOperation(operation)).toThrow(SubjectAccessPermissionRequiredError);
    expect(() => operation.getSubjectContext(permission)).toThrow(SubjectAccessPermissionRequiredError);
    expect(() => operation.requirePermission(subjectIdentifier)).toThrow(SubjectAccessPermissionRequiredError);
    const retry = await failure(operation.acquireForAuthentication(subjectIdentifier));
    expect(retry).toBeInstanceOf(SubjectAccessPermissionRequiredError);
    const gate = Promise.withResolvers<string>();
    fixture.barrier.readCommittedTransitionId.mockImplementation(() => gate.promise);
    const pendingOperation = fixture.createOperation();
    const pending = failure(pendingOperation.acquireForSession(session()));
    pendingOperation.close();
    gate.resolve(generation);
    expect(await pending).toBeInstanceOf(SubjectAccessPermissionRequiredError);
  });
  test.each([false, true])("run closes on completion or failure (failure=%s) and public calls are lazy", async (throws) => {
    const fixture = setup();
    let escaped = fixture.createOperation();
    const work = fixture.run(async (operation) => {
      escaped = operation;
      if (throws)
        throw new Error("business failed");
      return "public result";
    });
    if (throws)
      expect(await failure(work)).toBeInstanceOf(Error);
    else
      expect(await work).toBe("public result");
    expect(() => requireSubjectAccessOperation(escaped)).toThrow(SubjectAccessPermissionRequiredError);
    expect(fixture.barrier.readCommittedTransitionId).not.toHaveBeenCalled();
  });
  test("codec round-trips persisted identity but refuses malformed provider generations", async () => {
    expect(parseSubjectAccessContext(persisted())).toEqual({ version: 1, subjectIdentifier, transitionId: generation });
    const fixture = setup();
    fixture.barrier.readCommittedTransitionId.mockResolvedValue("bad generation");
    const error = await failure(fixture.createOperation().acquireForAuthentication(subjectIdentifier));
    expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
    expect(fixture.revocation.revokeUserSessions).not.toHaveBeenCalled();
  });
});
