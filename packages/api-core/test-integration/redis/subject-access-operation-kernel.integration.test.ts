import type { SessionKernelRedisTestScope } from "@iam/session-kernel/testing";
import type { RedisTestHarness, SubjectAccessRedisTestScope } from "./redis-test-harness";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  createSubjectAccessOperations,
  createSubjectAccessSessionContext,
  createSubjectAccessSessionRevocation,
  parseSubjectAccessContext,
  SubjectAccessOperationDeniedError,
  SubjectAccessUnavailableError,
} from "../../src/subject-access";
import { createRedisTestHarness } from "./redis-test-harness";

const subject = "00000000-0000-4000-8000-000000000001";
const principal = { principalType: "user", subjectId: subject };
let harness: RedisTestHarness;
let barrier: SubjectAccessRedisTestScope;
let scope: SessionKernelRedisTestScope;
let reads: number;

beforeAll(async () => {
  harness = await createRedisTestHarness();
});
beforeEach(async () => {
  reads = 0;
  barrier = await harness.createSubjectAccessScope({
    writerTransitionIds: Array.from({ length: 10 }, () => randomUUID()),
    observerTransitionIds: Array.from({ length: 10 }, () => randomUUID()),
  });
  scope = await harness.createSessionKernelScope();
  await transition("enabled");
});
afterEach(async () => {
  await scope.close();
  await barrier.close();
});
afterAll(async () => {
  await harness.close();
});

async function transition(state: "enabled" | "disabled") {
  const receipt = await barrier.writer.beginBlocking(subject);
  await barrier.writer.prepareRepair(receipt, state);
  await barrier.writer.finalize(receipt, state);
}

function operations() {
  return createSubjectAccessOperations({
    barrier: {
      async readCommittedTransitionId(id) {
        reads += 1;
        return await barrier.observer.readCommittedTransitionId(id);
      },
    },
    revocation: createSubjectAccessSessionRevocation(scope.writer),
  });
}

async function login() {
  return await operations().run(async (operation) => {
    const permission = await operation.acquireForAuthentication(subject);
    const context = createSubjectAccessSessionContext(operation, permission);
    const result = await scope.writer.createPrincipalSession(subject, context);
    if (result.status !== "created" || !result.externalToken)
      throw new Error("expected created root");
    return { ...result, externalToken: result.externalToken, context };
  });
}

async function rejected(promise: Promise<unknown>) {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("expected rejection");
}

describe("Subject Access operation with the neutral Redis Kernel", () => {
  test("one permission survives blocking through root creation, inheritance, renewal and consumption", async () => {
    const operation = operations().createOperation();
    const permission = await operation.acquireForAuthentication(subject);
    const context = createSubjectAccessSessionContext(operation, permission);
    await barrier.writer.beginBlocking(subject);
    const root = await scope.writer.createPrincipalSession(subject, context);
    expect(root.status).toBe("created");
    if (root.status !== "created")
      throw new Error("expected root");
    const id = root.value.principalSessionId;
    const binding = await scope.writer.createClientBinding({ principalSessionId: id, protocol: "oidc", clientCode: "client" });
    const credential = await scope.writer.issueCredential({ principalSessionId: id, protocol: "oidc", clientCode: "client", credentialType: "access_token" });
    const artifact = await scope.writer.createProtocolArtifact({ principalSessionId: id, protocol: "oidc", artifactType: "code", ttlMs: 10_000 });
    const renewed = await scope.writer.renewPrincipalSession(id);
    for (const result of [binding, credential, artifact, renewed]) {
      expect(result.status === "created" || result.status === "resolved").toBe(true);
      if (result.status === "created" || result.status === "resolved")
        expect(result.value.subjectContext).toBe(context.subjectContext);
    }
    if (artifact.status !== "created" || !artifact.externalToken)
      throw new Error("expected artifact");
    const consumed = await scope.writer.consumeProtocolArtifact(artifact.externalToken);
    const replay = await scope.writer.consumeProtocolArtifact(artifact.externalToken);
    expect(consumed.status).toBe("resolved");
    expect(replay.status).toBe("consumed_replay");
    expect(reads).toBe(1);
    operation.close();
    const error = await rejected(operations().run(op => op.acquireForSession({ subjectIdentifier: subject, subjectContext: context.subjectContext, principalSessionId: id })));
    expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
    const retained = await scope.writer.resolvePrincipalSessionById(id);
    expect(retained.status).toBe("resolved");
  });

  test("late creation keeps the original generation and stale denial revokes its derived objects", async () => {
    const operation = operations().createOperation();
    const permission = await operation.acquireForAuthentication(subject);
    const context = createSubjectAccessSessionContext(operation, permission);
    await transition("disabled");
    await transition("enabled");
    const late = await scope.writer.createPrincipalSession(subject, context);
    if (late.status !== "created")
      throw new Error("expected late root");
    const child = await scope.writer.issueCredential({ principalSessionId: late.value.principalSessionId, protocol: "test", clientCode: "client", credentialType: "access" });
    if (child.status !== "created" || !child.externalToken)
      throw new Error("expected child");
    operation.close();
    const fresh = await login();
    expect(fresh.context.subjectContext).not.toBe(context.subjectContext);
    const error = await rejected(operations().run(op => op.acquireForSession({ subjectIdentifier: subject, subjectContext: late.value.subjectContext, principalSessionId: late.value.principalSessionId })));
    expect(error).toBeInstanceOf(SubjectAccessOperationDeniedError);
    const revokedChild = await scope.writer.resolveCredential(child.externalToken);
    const newRoot = await scope.writer.resolvePrincipalSession(fresh.externalToken);
    expect(revokedChild.status).toBe("revoked");
    expect(newRoot.status).toBe("resolved");
  });

  test("prepared and exact-context late revocation retain a newly enabled generation", async () => {
    const old = await login();
    const revocation = createSubjectAccessSessionRevocation(scope.writer);
    const prepared = await revocation.prepareUserSessionRevocation(principal);
    await transition("disabled");
    await transition("enabled");
    const fresh = await login();
    // A root created after preparation, using the captured old context, is still covered.
    const late = await scope.writer.createPrincipalSession(subject, old.context);
    if (late.status !== "created")
      throw new Error("expected late root");
    const summary = await prepared.revoke("user_disabled");
    expect(summary.principalSessions.revoked).toBe(2);
    const exact = await revocation.revokeUserSessions(principal, "user_disabled", { onlySubjectAccessTransitionId: parseSubjectAccessContext(old.context.subjectContext).transitionId });
    expect(exact.principalSessions.revoked).toBe(0);
    const retained = await scope.writer.resolvePrincipalSession(fresh.externalToken);
    expect(retained.status).toBe("resolved");
  });

  test.each([undefined, "broken", "{\"version\":2}"])("outer access rejects unusable context %p without repairing or revoking the record", async (subjectContext) => {
    const root = await login();
    await scope.seedPrincipalPayload(root.value.principalSessionId, JSON.stringify({ ...root.value, subjectContext }));
    const resolved = await scope.writer.resolvePrincipalSession(root.externalToken);
    if (resolved.status !== "resolved")
      throw new Error("Kernel must leave context interpretation to its owner");
    const before = reads;
    const error = await rejected(operations().run(op => op.acquireForSession({ subjectIdentifier: subject, principalSessionId: root.value.principalSessionId, subjectContext: resolved.value.subjectContext })));
    expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
    expect(reads).toBe(before);
    const retained = await scope.writer.resolvePrincipalSession(root.externalToken);
    expect(retained.status).toBe("resolved");
    if (retained.status === "resolved")
      expect(retained.value.subjectContext).toBe(subjectContext);
  });

  test("subject-free artifacts need no account context and remain single-use", async () => {
    const artifact = await scope.writer.createProtocolArtifact({ protocol: "oidc", artifactType: "return_handle", ttlMs: 10_000 });
    if (artifact.status !== "created" || !artifact.externalToken)
      throw new Error("expected artifact");
    expect(artifact.value.subjectContext).toBeUndefined();
    const consumed = await scope.writer.consumeProtocolArtifact(artifact.externalToken);
    expect(consumed.status).toBe("resolved");
    expect(reads).toBe(0);
  });

  test("a disabled denial survives a real revocation failure and the next attempt still denies", async () => {
    const root = await login();
    await transition("disabled");
    scope.failNextPrincipalRevoke();
    const target = {
      subjectIdentifier: subject,
      principalSessionId: root.value.principalSessionId,
      subjectContext: root.value.subjectContext,
    };
    const error = await rejected(operations().run(op => op.acquireForSession(target)));
    expect(error).toBeInstanceOf(SubjectAccessOperationDeniedError);
    expect(error).toHaveProperty("reason", "user_disabled");
    const retry = await rejected(operations().run(op => op.acquireForSession(target)));
    expect(retry).toBeInstanceOf(SubjectAccessOperationDeniedError);
    const resolved = await scope.writer.resolvePrincipalSession(root.externalToken);
    expect(resolved.status).toBe("revoked");
  });

  test("empty prepared scope remains empty unless the owner supplies its prior context", async () => {
    const revocation = createSubjectAccessSessionRevocation(scope.writer);
    const prepared = await revocation.prepareUserSessionRevocation(principal);
    const root = await login();
    const empty = await prepared.revoke("user_disabled");
    expect(empty.principalSessions.revoked).toBe(0);
    const included = await prepared.revoke("user_disabled", {
      onlySubjectAccessTransitionId: parseSubjectAccessContext(root.context.subjectContext).transitionId,
    });
    expect(included.principalSessions.revoked).toBe(1);
  });

  test("derived input cannot substitute context and permission cannot recreate a revoked parent", async () => {
    const root = await login();
    const input = {
      principalSessionId: root.value.principalSessionId,
      subjectContext: "replacement",
      protocol: "oidc",
      clientCode: "client",
      credentialType: "access",
    };
    const child = await scope.writer.issueCredential(input);
    expect(child.status).toBe("created");
    if (child.status === "created")
      expect(child.value.subjectContext).toBe(root.context.subjectContext);
    await scope.writer.revokePrincipalSession(root.value.principalSessionId);
    const denied = await scope.writer.issueCredential(input);
    expect(denied.status).toBe("revoked");
    expect(reads).toBe(1);
  });
});
