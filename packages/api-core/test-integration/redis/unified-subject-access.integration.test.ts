import type { SubjectAccessOperation } from "../../src/subject-access";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import { expect, test } from "bun:test";
import {
  createSubjectAccessOperations,
  createUnifiedSubjectAccessSessionRevocation,
  requireSubjectAccessOperation,
  SubjectAccessOperationDeniedError,
} from "../../src/subject-access";

async function fixture() {
  const url = process.env.IAM_API_CORE_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_API_CORE_TEST_REDIS_URL is required");
  const scope = await createUnifiedSessionRedisTestScope(url);
  const kernel = scope.createFactoryForOperations<SubjectAccessOperation>(requireSubjectAccessOperation);
  let generation = randomUUID();
  const subject = randomUUID();
  let operations: ReturnType<typeof createSubjectAccessOperations>;
  const revocation = createUnifiedSubjectAccessSessionRevocation(kernel, {
    run: callback => operations.run(callback),
  });
  operations = createSubjectAccessOperations({
    barrier: { readCommittedTransitionId: async () => generation },
    revocation,
  });
  async function create() {
    return await operations.run(async (operation) => {
      const permission = await operation.acquireForAuthentication(subject);
      const root = await kernel.forOperation(operation).createUserSession({
        subjectIdentifier: subject,
        subjectContext: operation.getSubjectContext(permission),
        amr: ["pwd"],
      });
      const child = await kernel
        .forOperation(operation)
        .openClientSession(root.observation, { clientId: "iam", protocol: "oidc" });
      if (child.status !== "created" && child.status !== "reused")
        throw new Error("Child fixture failed");
      return { bearer: root.bearer, root: root.observation.userSession, child: child.value.clientSession };
    });
  }
  async function status(bearer: string) {
    return await operations.run(
      async operation => (await kernel.forOperation(operation).resolveUserSession(bearer)).status,
    );
  }
  return {
    scope,
    kernel,
    subject,
    operations,
    revocation,
    create,
    status,
    nextGeneration() {
      generation = randomUUID();
    },
  };
}

test("unified self revocation preserves the current root but terminates its children and other roots", async () => {
  const f = await fixture();
  try {
    const current = await f.create();
    const other = await f.create();
    const result = await f.revocation.revokeUserSessions({ subjectId: f.subject }, "admin_revoke", {
      exceptPrincipalSessionId: current.root.userSessionId,
    });
    expect(result).toMatchObject({ userSessionsTerminated: 1, clientSessionsTerminated: 2, unfinished: [] });
    expect(result.results.filter(item => item.status === "excluded")).toHaveLength(1);
    const currentStatus = await f.status(current.bearer);
    const otherStatus = await f.status(other.bearer);
    expect([currentStatus, otherStatus]).toEqual(["resolved", "terminated"]);
    const child = await f.operations.run(
      async operation =>
        await f.kernel.forOperation(operation).resolveClientSessionForUse({
          userSessionId: current.root.userSessionId,
          clientSessionId: current.child.clientSessionId,
          clientId: "iam",
        }),
    );
    expect(child.status).toBe("terminated");
  }
  finally {
    await f.scope.close();
  }
});

test("unified prepared context revocation includes late old-generation roots and preserves re-enabled roots", async () => {
  const f = await fixture();
  try {
    const first = await f.create();
    const plan = await f.revocation.prepareUserSessionRevocation({ subjectId: f.subject });
    const late = await f.create();
    f.nextGeneration();
    const fresh = await f.create();
    const result = await plan.revoke("user_disabled");
    expect(result).toMatchObject({ userSessionsTerminated: 2, clientSessionsTerminated: 2 });
    const statuses = [
      await f.status(first.bearer),
      await f.status(late.bearer),
      await f.status(fresh.bearer),
    ];
    expect(statuses).toEqual(["terminated", "terminated", "resolved"]);
    const retry = await plan.revoke("user_disabled");
    expect(retry.userSessionsTerminated).toBe(0);
  }
  finally {
    await f.scope.close();
  }
});

test("unified stale permission denial uses the original root and reports uncertain revocation honestly", async () => {
  const f = await fixture();
  try {
    const root = await f.create();
    f.nextGeneration();
    const fresh = await f.create();
    f.scope.failNext("revoke", true);
    let failure: unknown;
    try {
      await f.operations.run(async (operation) => {
        const result = await f.kernel.forOperation(operation).resolveUserSession(root.bearer);
        if (result.status !== "resolved")
          throw new Error("Root missing");
        await operation.acquireForSession({
          principalSessionId: result.value.userSession.userSessionId,
          subjectIdentifier: f.subject,
          subjectContext: result.value.userSession.subjectContext,
        });
      });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(SubjectAccessOperationDeniedError);
    if (
      !(failure instanceof SubjectAccessOperationDeniedError)
      || !failure.revokeSummary
      || !("results" in failure.revokeSummary)
    ) {
      throw new Error("Missing new summary");
    }
    expect(failure.revokeSummary.results.some(result => result.status === "unknown")).toBe(true);
    const status = await f.status(fresh.bearer);
    expect(status).toBe("resolved");
  }
  finally {
    await f.scope.close();
  }
});
