import type { SubjectAccessOperation } from "../../src/subject-access";
import type { RedisTestHarness, SubjectAccessRedisTestScope } from "./redis-test-harness";
import { randomUUID } from "node:crypto";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  createSubjectAccessOperations,
  createSubjectAccessSessionContext,
  createUnifiedSubjectAccessSessionRevocation,
  parseSubjectAccessContext,
  requireSubjectAccessOperation,
  SubjectAccessOperationDeniedError,
  SubjectAccessUnavailableError,
} from "../../src/subject-access";
import { createRedisTestHarness } from "./redis-test-harness";

const subject = "00000000-0000-4000-8000-000000000001";
const principal = { subjectId: subject };
let harness: RedisTestHarness;
let barrier: SubjectAccessRedisTestScope;
let scope: Awaited<ReturnType<typeof createUnifiedSessionRedisTestScope>>;
let kernel: ReturnType<typeof scope.createFactoryForOperations<SubjectAccessOperation>>;
let operations: ReturnType<typeof createSubjectAccessOperations>;
let revocation: ReturnType<typeof createUnifiedSubjectAccessSessionRevocation>;
let reads: number;
beforeAll(async () => {
  harness = await createRedisTestHarness();
});
beforeEach(async () => {
  reads = 0;
  barrier = await harness.createSubjectAccessScope({
    writerTransitionIds: Array.from({ length: 20 }, () => randomUUID()),
    observerTransitionIds: Array.from({ length: 20 }, () => randomUUID()),
  });
  scope = await createUnifiedSessionRedisTestScope(process.env.IAM_API_CORE_TEST_REDIS_URL!);
  kernel = scope.createFactoryForOperations<SubjectAccessOperation>(requireSubjectAccessOperation);
  revocation = createUnifiedSubjectAccessSessionRevocation(kernel, {
    run: callback => operations.run(callback),
  });
  operations = createSubjectAccessOperations({
    barrier: {
      async readCommittedTransitionId(id) {
        reads++;
        return await barrier.observer.readCommittedTransitionId(id);
      },
    },
    revocation,
  });
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
async function login() {
  return await operations.run(async (operation) => {
    const permission = await operation.acquireForAuthentication(subject);
    const context = createSubjectAccessSessionContext(operation, permission);
    const root = await kernel
      .forOperation(operation)
      .createUserSession({ subjectIdentifier: subject, ...context, amr: ["pwd"] });
    return {
      ...root,
      context,
      target: {
        kind: "userSession" as const,
        id: root.observation.userSession.userSessionId,
        instance: root.observation.userSession.instance,
        userSessionId: root.observation.userSession.userSessionId,
        subjectIdentifier: subject,
      },
    };
  });
}
async function rejected(promise: Promise<unknown>) {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected rejection");
}
async function readRoot(bearer: string) {
  return await operations.run(operation => kernel.forOperation(operation).resolveUserSession(bearer));
}
function access(root: Awaited<ReturnType<typeof login>>) {
  return {
    subjectIdentifier: subject,
    principalSessionId: root.target.id,
    subjectContext: root.context.subjectContext,
  };
}
test("accepted permission survives blocking through root creation and child authorization; next operation fails without revoking on uncertainty", async () => {
  const operation = operations.createOperation();
  const permission = await operation.acquireForAuthentication(subject);
  const context = createSubjectAccessSessionContext(operation, permission);
  await barrier.writer.beginBlocking(subject);
  const sessions = kernel.forOperation(operation);
  const root = await sessions.createUserSession({ subjectIdentifier: subject, ...context, amr: ["pwd"] });
  const child = await sessions.openClientSession(root.observation, { clientId: "client", protocol: "oidc" });
  expect(child.status).toBe("created");
  if (child.status !== "created")
    throw new Error("Expected child");
  expect(child.value.clientSession.subjectContext).toBe(context.subjectContext);
  const lifetime = await sessions.getIssuanceLifetime(child.value, 60);
  expect(lifetime.expiresAt).toBeLessThanOrEqual(root.observation.userSession.expiresAt);
  expect(reads).toBe(1);
  operation.close();
  const error = await rejected(
    operations.run(op =>
      op.acquireForSession({
        subjectIdentifier: subject,
        subjectContext: context.subjectContext,
        principalSessionId: root.observation.userSession.userSessionId,
      }),
    ),
  );
  expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
  const retained = await readRoot(root.bearer);
  expect(retained.status).toBe("resolved");
});
test("late old-generation creation is rejected and terminates its exact descendants while a new generation stays active", async () => {
  const operation = operations.createOperation();
  const permission = await operation.acquireForAuthentication(subject);
  const context = createSubjectAccessSessionContext(operation, permission);
  await transition("disabled");
  await transition("enabled");
  const sessions = kernel.forOperation(operation);
  const late = await sessions.createUserSession({ subjectIdentifier: subject, ...context, amr: [] });
  const child = await sessions.openClientSession(late.observation, { clientId: "client", protocol: "oidc" });
  if (child.status !== "created")
    throw new Error("Expected child");
  operation.close();
  const fresh = await login();
  const error = await rejected(
    operations.run(op =>
      op.acquireForSession({
        subjectIdentifier: subject,
        subjectContext: context.subjectContext,
        principalSessionId: late.observation.userSession.userSessionId,
      }),
    ),
  );
  expect(error).toBeInstanceOf(SubjectAccessOperationDeniedError);
  const result = await operations.run(op =>
    kernel.forOperation(op).resolveClientSessionForUse({
      userSessionId: late.observation.userSession.userSessionId,
      clientSessionId: child.value.clientSession.clientSessionId,
      clientId: "client",
    }),
  );
  const retained = await readRoot(fresh.bearer);
  expect(result.status).toBe("terminated");
  expect(retained.status).toBe("resolved");
});
test("prepared generation revocation and exact-context retries retain newly enabled roots", async () => {
  const old = await login();
  const prepared = await revocation.prepareUserSessionRevocation(principal);
  await transition("disabled");
  await transition("enabled");
  const fresh = await login();
  await operations.run(op =>
    kernel.forOperation(op).createUserSession({ subjectIdentifier: subject, ...old.context, amr: [] }),
  );
  const summary = await prepared.revoke("user_disabled");
  expect(summary.userSessionsTerminated).toBe(2);
  const exact = await revocation.revokeUserSessions(principal, "user_disabled", {
    onlySubjectAccessTransitionId: parseSubjectAccessContext(old.context.subjectContext).transitionId,
  });
  expect(exact.userSessionsTerminated).toBe(0);
  const retained = await readRoot(fresh.bearer);
  expect(retained.status).toBe("resolved");
});
test.each(["broken", "{\"version\":2}"])(
  "unusable opaque context %s fails at its owner without record mutation or a barrier read",
  async (subjectContext) => {
    const root = await login();
    await scope.replaceSubjectContext(root.target, subjectContext);
    const before = reads;
    const error = await rejected(
      operations.run(op => op.acquireForSession({ ...access(root), subjectContext })),
    );
    expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
    expect(reads).toBe(before);
    const retained = await readRoot(root.bearer);
    expect(retained.status).toBe("resolved");
    if (retained.status === "resolved")
      expect(retained.value.userSession.subjectContext).toBe(subjectContext);
  },
);
test("missing required context is corrupt in the current Kernel record and remains retained", async () => {
  const root = await login();
  await scope.replaceSubjectContext(root.target, undefined);
  const retained = await readRoot(root.bearer);
  expect(retained.status).toBe("corrupt");
  expect(reads).toBe(1);
});
test("disabled denial survives a real revocation failure; re-enable cannot reactivate the old generation", async () => {
  const root = await login();
  await transition("disabled");
  scope.failNext("revoke");
  const error = await rejected(operations.run(op => op.acquireForSession(access(root))));
  expect(error).toBeInstanceOf(SubjectAccessOperationDeniedError);
  expect(error).toHaveProperty("reason", "user_disabled");
  const stillStored = await readRoot(root.bearer);
  expect(stillStored.status).toBe("resolved");
  await transition("enabled");
  const fresh = await login();
  const retry = await rejected(operations.run(op => op.acquireForSession(access(root))));
  expect(retry).toBeInstanceOf(SubjectAccessOperationDeniedError);
  const oldResult = await readRoot(root.bearer);
  const newResult = await readRoot(fresh.bearer);
  expect(oldResult.status).toBe("terminated");
  expect(newResult.status).toBe("resolved");
});
test("empty prepared scope stays empty until the owner supplies the prior context", async () => {
  const prepared = await revocation.prepareUserSessionRevocation(principal);
  const root = await login();
  const empty = await prepared.revoke("user_disabled");
  expect(empty.userSessionsTerminated).toBe(0);
  const included = await prepared.revoke("user_disabled", {
    onlySubjectAccessTransitionId: parseSubjectAccessContext(root.context.subjectContext).transitionId,
  });
  expect(included.userSessionsTerminated).toBe(1);
});
