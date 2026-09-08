import type { SessionKernel, SessionKernelDependencies } from "@iam/session-kernel";
import {
  createSubjectAccessBarrier,
  createSubjectAccessLifecycle,
  createSubjectAccessPrincipalValidator,
  createSubjectAccessRepair,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
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

function createSessionKernel(
  deps: Omit<SessionKernelDependencies, "principalAccessFence">
    & Partial<Pick<SessionKernelDependencies, "principalAccessFence">>,
) {
  return createSessionKernelForTesting({
    principalAccessFence: {
      capture: () => "20000000-0000-4000-8000-000000000001",
      validate: () => ({ ok: true }),
    },
    ...deps,
  });
}
function createDerivedObject(
  kernel: SessionKernel,
  operation: "artifact" | "binding" | "credential",
  principalSessionId: string,
) {
  if (operation === "binding") {
    return kernel.createClientBinding({
      principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
    });
  }
  if (operation === "credential") {
    return kernel.issueCredential({
      principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      credentialType: "access_token",
      ttlMs: 30_000,
    });
  }
  return kernel.createProtocolArtifact({
    principalSessionId,
    protocol: "oidc",
    clientCode: "portal",
    artifactType: "authorization_code",
    ttlMs: 30_000,
  });
}
function subjectIdentifierFor(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const principal = { principalType: "user", subjectId: subjectIdentifierFor(1) };

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
      principalAccessFence: createSubjectAccessPrincipalValidator(barrier),
    });
    const oldSession = await kernel.createPrincipalSession(principal.subjectId);
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
    const newSession = await kernel.createPrincipalSession(principal.subjectId);
    if (newSession.status !== "created")
      throw new Error("expected new Principal Session");

    await expect(kernel.resolvePrincipalSession(oldSession.externalToken!))
      .resolves
      .toMatchObject({
        status: "validation_failed",
        reason: "session_generation_stale",
      });
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
      principalAccessFence: createSubjectAccessPrincipalValidator(barrier),
    });
    const oldSession = await kernel.createPrincipalSession(principal.subjectId);
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
        await kernel.revokeUserSessions(
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
    const newSession = await kernel.createPrincipalSession(principal.subjectId);
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
  test("preserves Subject Access classification across every Session Kernel create path", async () => {
    for (const error of [
      new SubjectAccessDisabledError(),
      new SubjectAccessUnavailableError(),
    ]) {
      const redis = new KernelFakeRedis();
      const kernel = createSessionKernel({
        redis,
        config: createConfig(redis),
        principalAccessFence: {
          capture: () => {
            throw error;
          },
          validate: () => ({ ok: true }),
        },
      });

      await expect(kernel.createPrincipalSession(principal.subjectId))
        .rejects
        .toBe(error);
    }

    for (const operation of ["binding", "credential", "artifact"] as const) {
      let validation: "enabled" | "disabled" | "unavailable" = "enabled";
      const unavailable = new SubjectAccessUnavailableError();
      const redis = new KernelFakeRedis();
      const kernel = createSessionKernel({
        redis,
        config: createConfig(redis),
        principalAccessFence: {
          capture: () => "20000000-0000-4000-8000-000000000001",
          validate: () => {
            if (validation === "disabled")
              return { ok: false as const, reason: "user_disabled" as const };
            if (validation === "unavailable")
              throw unavailable;
            return { ok: true as const };
          },
        },
      });
      const session = await kernel.createPrincipalSession(principal.subjectId);
      expect(session.status).toBe("created");
      if (session.status !== "created")
        continue;

      validation = "disabled";
      await expect(createDerivedObject(
        kernel,
        operation,
        session.value.principalSessionId,
      )).resolves.toMatchObject({
        status: "validation_failed",
        reason: "user_disabled",
      });

      validation = "enabled";
      const replacement = await kernel.createPrincipalSession(principal.subjectId);
      expect(replacement.status).toBe("created");
      if (replacement.status !== "created")
        continue;
      validation = "unavailable";
      await expect(createDerivedObject(
        kernel,
        operation,
        replacement.value.principalSessionId,
      )).rejects.toBe(unavailable);
    }
  });
});
