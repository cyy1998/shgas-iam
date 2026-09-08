import type { PrincipalSession, SessionKernelDependencies } from "@iam/session-kernel";
import {
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessOperations,
  createSubjectAccessRepair,
  createSubjectAccessSessionContext,
  createSubjectAccessSessionRevocation,
  SubjectAccessOperationDeniedError,
} from "@iam/api-core/subject-access";
import { createSessionKernelConfig } from "@iam/session-kernel";
import { createSessionKernelForTesting, KernelFakeRedis } from "@iam/session-kernel/testing";
import { describe, expect, test } from "bun:test";
import { createInMemorySubjectAccessStore } from "../../src/subject-access/testing";

function createConfig(
  redis: KernelFakeRedis,
  overrides: Partial<Parameters<typeof createSessionKernelConfig>[0]> = {},
) {
  return createSessionKernelConfig({
    principalIdleTtlMs: 60_000,
    principalAbsoluteTtlMs: 300_000,
    tombstoneTtlMs: 10_000,
    tombstoneGraceMs: 5_000,
    lookupHmacKeys: {
      current: { id: "current", secret: "c".repeat(32) },
    },
    clock: { now: () => redis.now },
    ...overrides,
  });
}

function createSessionKernel(deps: SessionKernelDependencies) {
  return createSessionKernelForTesting(deps);
}

const principal = { principalType: "user", subjectId: subjectIdentifierFor(1) };

async function login(
  kernel: ReturnType<typeof createSessionKernel>,
  barrier: ReturnType<typeof createSubjectAccessBarrier>,
) {
  return await createSubjectAccessOperations({
    barrier,
    revocation: createSubjectAccessSessionRevocation(kernel),
  }).run(async (operation) => {
    const permission = await operation.acquireForAuthentication(principal.subjectId);
    return await kernel.createPrincipalSession(principal.subjectId, createSubjectAccessSessionContext(operation, permission));
  });
}

async function authorize(
  kernel: ReturnType<typeof createSessionKernel>,
  barrier: ReturnType<typeof createSubjectAccessBarrier>,
  session: PrincipalSession,
) {
  return await createSubjectAccessOperations({
    barrier,
    revocation: createSubjectAccessSessionRevocation(kernel),
  }).run(async (operation) => {
    return await operation.acquireForSession({
      subjectIdentifier: session.principal.subjectId,
      subjectContext: session.subjectContext,
      principalSessionId: session.principalSessionId,
    });
  });
}

function subjectIdentifierFor(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

describe("Subject Access and Session Kernel collaboration", () => {
  test("keeps a pre-disable session invalid after revocation failure, repair, and re-enable", async () => {
    const redis = new KernelFakeRedis();
    const transitions = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ];
    let transitionIndex = 0;
    const accessStore = createInMemorySubjectAccessStore([{
      version: 1,
      subjectIdentifier: principal.subjectId,
      state: "enabled",
      transitionId: "20000000-0000-4000-8000-000000000001",
      updatedAt: "2026-07-31T08:00:00.000Z",
    }], { clock: { now: () => redis.now } });
    const barrier = createSubjectAccessBarrier({
      store: accessStore,
      clock: { nowDate: () => new Date(redis.now) },
      random: { uuid: () => transitions[transitionIndex++]! },
    });
    const lifecycle = createSubjectAccessLifecycle({
      barrier,
      logger: { warn: () => undefined },
      random: {
        uuid: (() => {
          const values = [
            transitions[0]!,
            "40000000-0000-4000-8000-000000000001",
            transitions[1]!,
            "40000000-0000-4000-8000-000000000002",
          ];
          return () => values.shift()!;
        })(),
      },
      transitionIntent: {
        create: async () => undefined,
        assertCommitted: async () => undefined,
        markRolledBack: async () => undefined,
      },
    });
    const kernel = createSessionKernel({
      redis,
      config: createConfig(redis),
    });
    const oldSession = await login(kernel, barrier);
    if (oldSession.status !== "created")
      throw new Error("expected old Principal Session");

    await lifecycle.run({
      subjectIdentifier: principal.subjectId,
      disposition: "disabled",
      mutate: async () => undefined,
      revokeSessions: async () => {
        throw new Error("session Redis cleanup failed");
      },
    });
    await lifecycle.run({
      subjectIdentifier: principal.subjectId,
      disposition: "awaiting_publication",
      mutate: async () => undefined,
    });
    const repair = createSubjectAccessRepair({
      authority: {
        resolve: async () => ({
          accountState: "enabled",
          factsState: "current",
        }),
      },
      backlog: accessStore,
      barrier,
      logger: { warn: () => undefined },
      random: { uuid: () => "30000000-0000-4000-8000-000000000001" },
    });
    await expect(repair.repairSubject(principal.subjectId)).resolves.toEqual({
      status: "enabled",
    });
    const newSession = await login(kernel, barrier);
    if (newSession.status !== "created")
      throw new Error("expected new Principal Session");

    let denial: unknown;
    try {
      await authorize(kernel, barrier, oldSession.value);
    }
    catch (error) { denial = error; }
    expect(denial).toBeInstanceOf(SubjectAccessOperationDeniedError);
    expect(denial).toMatchObject({ reason: "session_generation_stale" });
    await authorize(kernel, barrier, newSession.value);
    await expect(kernel.resolvePrincipalSession(newSession.externalToken!))
      .resolves
      .toMatchObject({
        status: "resolved",
        value: {
          principalSessionId: newSession.value.principalSessionId,
        },
      });
  });

  test("does not let late eager cleanup revoke sessions from a re-enabled generation", async () => {
    const redis = new KernelFakeRedis();
    const transitions = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ];
    let transitionIndex = 0;
    const accessStore = createInMemorySubjectAccessStore([{
      version: 1,
      subjectIdentifier: principal.subjectId,
      state: "enabled",
      transitionId: "20000000-0000-4000-8000-000000000001",
      updatedAt: "2026-07-31T08:00:00.000Z",
    }], { clock: { now: () => redis.now } });
    const barrier = createSubjectAccessBarrier({
      store: accessStore,
      clock: { nowDate: () => new Date(redis.now) },
      random: { uuid: () => transitions[transitionIndex++]! },
    });
    const lifecycle = createSubjectAccessLifecycle({
      barrier,
      logger: { warn: () => undefined },
      random: {
        uuid: (() => {
          const values = [
            transitions[0]!,
            "40000000-0000-4000-8000-000000000001",
            transitions[1]!,
            "40000000-0000-4000-8000-000000000002",
          ];
          return () => values.shift()!;
        })(),
      },
      transitionIntent: {
        create: async () => undefined,
        assertCommitted: async () => undefined,
        markRolledBack: async () => undefined,
      },
    });
    const kernel = createSessionKernel({
      redis,
      config: createConfig(redis),
    });
    const oldSession = await login(kernel, barrier);
    if (oldSession.status !== "created")
      throw new Error("expected old Principal Session");

    let cleanupStarted!: () => void;
    const cleanupDidStart = new Promise<void>((resolve) => {
      cleanupStarted = resolve;
    });
    let releaseCleanup!: () => void;
    const cleanupCanFinish = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const disabling = lifecycle.run({
      subjectIdentifier: principal.subjectId,
      disposition: "disabled",
      mutate: async () => undefined,
      revokeSessions: async (_result, context) => {
        cleanupStarted();
        await cleanupCanFinish;
        await createSubjectAccessSessionRevocation(kernel).revokeUserSessions(
          principal,
          "user_disabled",
          {
            onlySubjectAccessTransitionId:
              context.invalidatedSubjectAccessTransitionId,
          },
        );
      },
    });
    await cleanupDidStart;

    await lifecycle.run({
      subjectIdentifier: principal.subjectId,
      disposition: "awaiting_publication",
      mutate: async () => undefined,
    });
    const repair = createSubjectAccessRepair({
      authority: {
        resolve: async () => ({
          accountState: "enabled",
          factsState: "current",
        }),
      },
      backlog: accessStore,
      barrier,
      logger: { warn: () => undefined },
      random: { uuid: () => "30000000-0000-4000-8000-000000000001" },
    });
    await repair.repairSubject(principal.subjectId);
    const newSession = await login(kernel, barrier);
    if (newSession.status !== "created")
      throw new Error("expected new Principal Session");

    releaseCleanup();
    await disabling;

    await expect(kernel.resolvePrincipalSession(newSession.externalToken!))
      .resolves
      .toMatchObject({
        status: "resolved",
        value: {
          principalSessionId: newSession.value.principalSessionId,
        },
      });
  });
});
