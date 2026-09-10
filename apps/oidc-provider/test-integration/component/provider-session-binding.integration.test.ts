import { LoggerSourceApp } from "@iam/api-core/logger";
import { createSubjectAccessOperations, createSubjectAccessSessionRevocation, encodeSubjectAccessContext, SubjectAccessDisabledError } from "@iam/api-core/subject-access";
import { createSessionKernelConfig } from "@iam/session-kernel";
import { createSessionKernelForTesting } from "@iam/session-kernel/testing";
import { describe, expect, it } from "vitest";
import { createOidcSessionOperations } from "../../src/composition/session/session-operations.ts";
import {
  createOidcSessionKernelAdapter,
  createOidcSessionKernelCleanupAdapter,
} from "../../src/session/oidc-session-kernel.adapter.ts";
import { clientRuntime } from "./support/client-runtime.ts";
import { KernelRedis } from "./support/kernel-redis.ts";
import { ProviderSessionStateFake } from "./support/provider-session-state.ts";

const subjectIdentifier = "00000000-0000-4000-8000-000000000007";
const otherSubjectIdentifier = "00000000-0000-4000-8000-000000000008";

function createFixture() {
  const redis = new KernelRedis();
  const providerSessionState = new ProviderSessionStateFake();
  const accountReadSubjects: string[] = [];
  let clientAVersion = 1;
  let subjectEnabled = true;
  const kernel = createSessionKernelForTesting({
    redis,
    config: createSessionKernelConfig({
      principalIdleTtlMs: 60_000,
      principalAbsoluteTtlMs: 300_000,
      tombstoneTtlMs: 60_000,
      tombstoneGraceMs: 5_000,
      clock: { now: () => redis.now },
    }),
    cleanupAdapters: createOidcSessionKernelCleanupAdapter({ providerSessionState }),
    logger: { warn: () => undefined },
    sourceApp: LoggerSourceApp.OidcProvider,
  });
  const adapterDeps = {
    accounts: {
      findBySubject: async (subject: string) => {
        accountReadSubjects.push(subject);
        return subject === subjectIdentifier
          ? {
              id: 7,
              isDelete: false,
              mobile: null,
              name: "Alice",
              status: 1,
              subjectIdentifier,
              username: "alice",
            }
          : null;
      },
    },
    clients: {
      findActiveVersion: async (clientId: string) => clientId === "client-a" ? clientAVersion : clientId === "client-b" ? 2 : null,
      findRuntime: async (clientId: string) => ["client-a", "client-b"].includes(clientId)
        ? clientRuntime(clientId, clientId === "client-a" ? clientAVersion : 2)
        : null,
    },
    cookieName: "global_session",
    kernel,
    logger: { warn: () => undefined },
    providerSessionState,
  };
  const adapter = createOidcSessionKernelAdapter(adapterDeps);
  const operations = createSubjectAccessOperations({
    barrier: { readCommittedTransitionId: async () => {
      if (!subjectEnabled)
        throw new SubjectAccessDisabledError();
      return "20000000-0000-4000-8000-000000000001";
    } },
    revocation: createSubjectAccessSessionRevocation(kernel),
  });
  const sessions = createOidcSessionOperations(adapterDeps);
  return {
    sessions,
    operations,
    accountReadSubjects,
    adapter,
    kernel,
    providerSessionState,
    redis,
    advanceClientAEpoch() {
      clientAVersion += 1;
    },
    disableSubject() {
      subjectEnabled = false;
    },
  };
}

async function createPrincipalSession(
  kernel: ReturnType<typeof createSessionKernelForTesting>,
) {
  const principal = await kernel.createPrincipalSession(subjectIdentifier, { subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId: "20000000-0000-4000-8000-000000000001" }) });
  expect(principal.status).toBe("created");
  if (principal.status !== "created")
    throw new Error("Principal Session was not created");
  return {
    accountId: subjectIdentifier,
    authTime: Math.floor(principal.value.authTime / 1000),
    sessionId: principal.value.principalSessionId,
  };
}

async function commitStagedBinding(
  adapter: ReturnType<typeof createOidcSessionKernelAdapter>,
  providerSessionUid: string,
  session: { accountId: string; authTime: number; sessionId: string },
  context: { authorizationAttemptId?: string; clientId: string; oidcConfigVersion: number },
) {
  const authorizationAttemptId
    = context.authorizationAttemptId ?? `seed-${session.sessionId}-${context.clientId}`;
  const staged = await adapter.stage(session, {
    ...context,
    authorizationAttemptId,
    providerSessionUid,
  });
  expect(staged).not.toBeNull();
  return await adapter.consumeStaged({
    accountId: session.accountId,
    authorizationAttemptId,
    clientCode: context.clientId,
    providerSessionUid,
  });
}

describe("oIDC Provider Session client binding contract", () => {
  it("resolves the current Principal Session from the cookie without exposing bearer or database identifiers", async () => {
    const { accountReadSubjects, adapter, kernel } = createFixture();
    const principal = await kernel.createPrincipalSession(subjectIdentifier, { subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId: "20000000-0000-4000-8000-000000000001" }) });
    expect(principal.status).toBe("created");
    if (principal.status !== "created")
      return;
    expect(principal.externalToken).toBeDefined();
    if (!principal.externalToken)
      return;

    await expect(adapter.resolve({
      headers: { cookie: `global_session=${encodeURIComponent(principal.externalToken)}` },
    })).resolves.toEqual({
      accountId: subjectIdentifier,
      authTime: Math.floor(principal.value.authTime / 1000),
      sessionId: principal.value.principalSessionId,
    });
    expect(accountReadSubjects).toEqual([subjectIdentifier]);
  });

  it("publishes the minimal provider-facing binding owned by its Principal Session", async () => {
    const { adapter, kernel } = createFixture();
    const session = await createPrincipalSession(kernel);

    const staged = await adapter.stage(session, {
      authorizationAttemptId: "attempt-minimal-view",
      clientId: "client-a",
      oidcConfigVersion: 1,
      providerSessionUid: null,
    });

    expect(staged).toEqual({
      accountId: subjectIdentifier,
      authTime: session.authTime,
      anchorGeneration: "attempt-minimal-view",
      bindingId: "pending",
      clientCode: "client-a",
      oidcConfigVersion: 1,
      principalSessionId: session.sessionId,
      expiresAt: expect.any(Number),
    });

    const committed = await adapter.consumeStaged({
      accountId: subjectIdentifier,
      authorizationAttemptId: "attempt-minimal-view",
      clientCode: "client-a",
      providerSessionUid: "provider-session-minimal-view",
    });

    expect(committed).toEqual({
      accountId: subjectIdentifier,
      authTime: session.authTime,
      anchorGeneration: "attempt-minimal-view",
      bindingId: expect.any(String),
      clientCode: "client-a",
      oidcConfigVersion: 1,
      principalSessionId: session.sessionId,
      expiresAt: expect.any(Number),
      mappingOwnerId: expect.any(String),
    });
  });

  it("does not publish a staged Provider Session binding after the client epoch advances", async () => {
    const { adapter, advanceClientAEpoch, kernel } = createFixture();
    const session = await createPrincipalSession(kernel);
    await adapter.stage(session, {
      authorizationAttemptId: "attempt-old-epoch",
      clientId: "client-a",
      oidcConfigVersion: 1,
      providerSessionUid: null,
    });

    advanceClientAEpoch();

    await expect(adapter.consumeStaged({
      accountId: subjectIdentifier,
      authorizationAttemptId: "attempt-old-epoch",
      clientCode: "client-a",
      providerSessionUid: "provider-session-old-epoch",
    })).resolves.toBeNull();
    await expect(adapter.readForAuthorization(
      "provider-session-old-epoch",
      "client-a",
    )).resolves.toBeNull();
  });

  it("recognizes first authentication staged onto a retained Provider Session", async () => {
    const { adapter, kernel } = createFixture();
    const session = await createPrincipalSession(kernel);

    await adapter.stage(session, {
      authorizationAttemptId: "attempt-retained-provider-session",
      clientId: "client-a",
      oidcConfigVersion: 1,
      providerSessionUid: "provider-session-from-expired-principal",
    });

    await expect(adapter.isStagedPrincipal(
      "attempt-retained-provider-session",
      "client-a",
      session,
    )).resolves.toBe(true);
  });

  it("creates a second client binding from the same verified Principal Session and revokes clients independently", async () => {
    const { adapter, kernel } = createFixture();
    const principal = await kernel.createPrincipalSession(subjectIdentifier, { subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId: "20000000-0000-4000-8000-000000000001" }) });
    expect(principal.status).toBe("created");
    if (principal.status !== "created")
      return;
    const principalSessionId = principal.value.principalSessionId;
    const session = {
      accountId: subjectIdentifier,
      authTime: Math.floor(principal.value.authTime / 1000),
      sessionId: principalSessionId,
    };
    const bindingA = await commitStagedBinding(adapter, "provider-session-a", session, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    const anchor = await adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier);
    expect(anchor).not.toBeNull();

    const bindingB = await adapter.ensureClientBinding({
      accountId: subjectIdentifier,
      anchorGeneration: anchor!.generation,
      clientCode: "client-b",
      oidcConfigVersion: 2,
      principalSessionId,
      providerSessionUid: "provider-session-a",
    });

    expect(bindingB).toMatchObject({
      accountId: subjectIdentifier,
      clientCode: "client-b",
      principalSessionId,
    });
    expect(bindingB?.bindingId).not.toBe(bindingA?.bindingId);
    await adapter.revokeClientProtocol("client-b", "client_config_changed");
    await expect(adapter.readForAuthorization("provider-session-a", "client-b")).resolves.toBeNull();
    await expect(adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier))
      .resolves
      .toMatchObject({ generation: anchor!.generation, principalSessionId });
    await expect(adapter.readForAuthorization("provider-session-a", "client-a")).resolves.toMatchObject({
      bindingId: bindingA?.bindingId,
      clientCode: "client-a",
      principalSessionId,
    });
    await adapter.revokeClientProtocol("client-a", "client_config_changed");
    await expect(adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier))
      .resolves
      .toBeNull();
  });

  it("revokes only the invalidated client's binding and current access token credential", async () => {
    const { adapter, kernel } = createFixture();
    const session = await createPrincipalSession(kernel);
    const bindingA = await commitStagedBinding(adapter, "provider-session-a", session, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    const anchor = await adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier);
    expect(anchor).not.toBeNull();
    const bindingB = await adapter.ensureClientBinding({
      accountId: subjectIdentifier,
      anchorGeneration: anchor!.generation,
      clientCode: "client-b",
      oidcConfigVersion: 2,
      principalSessionId: session.sessionId,
      providerSessionUid: "provider-session-a",
    });
    expect(bindingA).not.toBeNull();
    expect(bindingB).not.toBeNull();
    await adapter.registerAccessTokenCredential({
      binding: bindingA,
      expiresIn: 60,
      payload: {
        extra: { authTime: bindingA!.authTime },
        accountId: subjectIdentifier,
        clientId: "client-a",
        scope: "openid",
        sessionUid: "provider-session-a",
      },
      providerTokenId: "token-a",
      providerTokenKey: "oidc:model:AccessToken:token-a",
    });
    await adapter.registerAccessTokenCredential({
      binding: bindingB,
      expiresIn: 60,
      payload: {
        extra: { authTime: bindingB!.authTime },
        accountId: subjectIdentifier,
        clientId: "client-b",
        scope: "openid",
        sessionUid: "provider-session-a",
      },
      providerTokenId: "token-b",
      providerTokenKey: "oidc:model:AccessToken:token-b",
    });

    await adapter.revokeClientProtocol("client-a", "client_config_changed");

    await expect(adapter.readForAuthorization("provider-session-a", "client-a")).resolves.toBeNull();
    await expect(adapter.resolveAccessTokenCredential("token-a")).resolves.toBeNull();
    await expect(adapter.readForAuthorization("provider-session-a", "client-b")).resolves.toMatchObject({
      bindingId: bindingB?.bindingId,
      clientCode: "client-b",
    });
    await expect(adapter.resolveAccessTokenCredential("token-b")).resolves.toMatchObject({
      credential: { clientCode: "client-b" },
      metadata: { providerTokenId: "token-b" },
    });
  });

  it("reuses the authoritative Kernel binding through the minimal lookup", async () => {
    const { accountReadSubjects, adapter, kernel } = createFixture();
    const session = await createPrincipalSession(kernel);
    const binding = await commitStagedBinding(adapter, "provider-session-a", session, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    expect(binding).not.toBeNull();
    const ensured = await adapter.ensureClientBinding({
      accountId: subjectIdentifier,
      anchorGeneration: binding!.anchorGeneration!,
      clientCode: "client-a",
      oidcConfigVersion: 1,
      principalSessionId: session.sessionId,
      providerSessionUid: "provider-session-a",
    });

    expect(ensured).toMatchObject({
      bindingId: binding!.bindingId,
      mappingOwnerId: binding!.mappingOwnerId,
      principalSessionId: session.sessionId,
    });
    expect(accountReadSubjects).toEqual([subjectIdentifier]);
  });

  it("rejects a lookup that points at a non-OIDC Kernel binding", async () => {
    const { adapter, kernel, providerSessionState } = createFixture();
    const session = await createPrincipalSession(kernel);
    const validBinding = await commitStagedBinding(adapter, "provider-session-a", session, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    expect(validBinding).not.toBeNull();
    const foreignBinding = await kernel.createClientBinding({
      principalSessionId: session.sessionId,
      protocol: "custom-sso",
      clientCode: "client-a",
      metadata: {
        anchorGeneration: validBinding!.anchorGeneration,
        mappingOwnerId: validBinding!.mappingOwnerId,
        oidcConfigVersion: 1,
        providerSessionUid: "provider-session-a",
      },
    });
    expect(foreignBinding.status).toBe("created");
    if (foreignBinding.status !== "created")
      return;
    providerSessionState.seedLookup("provider-session-a", "client-a", {
      bindingId: foreignBinding.value.bindingId,
      mappingOwnerId: validBinding!.mappingOwnerId,
    });

    await expect(adapter.readForAuthorization("provider-session-a", "client-a")).resolves.toBeNull();
  });

  it("rejects a Kernel binding outside the current Provider Session anchor generation", async () => {
    const { adapter, kernel, providerSessionState } = createFixture();
    const session = await createPrincipalSession(kernel);
    const binding = await commitStagedBinding(adapter, "provider-session-a", session, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    expect(binding).not.toBeNull();
    providerSessionState.seedAnchor("provider-session-a", {
      accountId: subjectIdentifier,
      generation: "replacement-generation",
      principalSessionId: session.sessionId,
    });

    await expect(adapter.readForAuthorization("provider-session-a", "client-a")).resolves.toBeNull();
  });

  it("rejects a binding lookup without a mapping owner", async () => {
    const { adapter, kernel, providerSessionState } = createFixture();
    const session = await createPrincipalSession(kernel);
    const binding = await commitStagedBinding(adapter, "provider-session-a", session, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    expect(binding).not.toBeNull();
    providerSessionState.seedLookup("provider-session-a", "client-a", {
      bindingId: binding!.bindingId,
    });

    await expect(adapter.readForAuthorization("provider-session-a", "client-a")).resolves.toBeNull();
  });

  it("refuses to ensure a binding without the current config, matching account, and enabled Principal Session", async () => {
    const { adapter, disableSubject, kernel, sessions, operations } = createFixture();
    const principal = await kernel.createPrincipalSession(subjectIdentifier, { subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId: "20000000-0000-4000-8000-000000000001" }) });
    expect(principal.status).toBe("created");
    if (principal.status !== "created")
      return;
    const input = {
      accountId: subjectIdentifier,
      anchorGeneration: "missing-anchor",
      clientCode: "client-b",
      oidcConfigVersion: 2,
      principalSessionId: principal.value.principalSessionId,
      providerSessionUid: "provider-session-a",
    };

    await expect(adapter.ensureClientBinding({ ...input, oidcConfigVersion: 1 })).resolves.toBeNull();
    await expect(adapter.ensureClientBinding({ ...input, accountId: otherSubjectIdentifier })).resolves.toBeNull();
    const session = {
      accountId: subjectIdentifier,
      authTime: Math.floor(principal.value.authTime / 1000),
      sessionId: principal.value.principalSessionId,
    };
    await commitStagedBinding(adapter, "provider-session-a", session, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    const anchor = await adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier);
    expect(anchor).not.toBeNull();
    disableSubject();
    await expect(operations.run(operation => sessions.forOperation(operation).ensureClientBinding({
      ...input,
      anchorGeneration: anchor!.generation,
    }))).rejects.toBeInstanceOf(SubjectAccessDisabledError);
    await expect(adapter.readForAuthorization("provider-session-a", "client-b")).resolves.toBeNull();
  });

  it("atomically rotates the Principal anchor and binding ownership while preserving other clients", async () => {
    const { adapter, kernel } = createFixture();
    const oldSession = await createPrincipalSession(kernel);
    const oldBinding = await commitStagedBinding(adapter, "provider-session-a", oldSession, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    expect(oldBinding).not.toBeNull();
    const oldToken = await adapter.registerAccessTokenCredential({
      binding: oldBinding,
      expiresIn: 60,
      payload: {
        extra: { authTime: oldBinding!.authTime },
        accountId: subjectIdentifier,
        clientId: "client-a",
        scope: "openid",
        sessionUid: "provider-session-a",
      },
      providerTokenId: "old-token",
      providerTokenKey: "oidc:model:AccessToken:old-token",
    });
    expect(oldToken).not.toBeNull();
    const newSession = await createPrincipalSession(kernel);

    const newBinding = await commitStagedBinding(adapter, "provider-session-a", newSession, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    const newAnchor = await adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier);
    expect(newAnchor).not.toBeNull();
    const bindingB = await adapter.ensureClientBinding({
      accountId: subjectIdentifier,
      anchorGeneration: newAnchor!.generation,
      clientCode: "client-b",
      oidcConfigVersion: 2,
      principalSessionId: newSession.sessionId,
      providerSessionUid: "provider-session-a",
    });

    expect(newBinding).toMatchObject({
      accountId: subjectIdentifier,
      principalSessionId: newSession.sessionId,
    });
    await expect(adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier))
      .resolves
      .toMatchObject({ principalSessionId: newSession.sessionId });
    await expect(adapter.readForAuthorization("provider-session-a", "client-a")).resolves.toMatchObject({
      bindingId: newBinding?.bindingId,
      principalSessionId: newSession.sessionId,
    });
    await expect(adapter.resolveAccessTokenCredential("old-token")).resolves.toBeNull();
    await adapter.revokeClientProtocol("client-a", "client_config_changed");
    await expect(adapter.readForAuthorization("provider-session-a", "client-b")).resolves.toMatchObject({
      bindingId: bindingB?.bindingId,
      principalSessionId: newSession.sessionId,
    });
  });

  it("keeps the old anchor, binding, and token ownership when the atomic rotation commit fails", async () => {
    const { adapter, kernel, providerSessionState } = createFixture();
    const oldSession = await createPrincipalSession(kernel);
    const oldBinding = await commitStagedBinding(adapter, "provider-session-a", oldSession, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    const oldToken = await adapter.registerAccessTokenCredential({
      binding: oldBinding,
      expiresIn: 60,
      payload: {
        extra: { authTime: oldBinding!.authTime },
        accountId: subjectIdentifier,
        clientId: "client-a",
        scope: "openid",
        sessionUid: "provider-session-a",
      },
      providerTokenId: "old-token",
      providerTokenKey: "oidc:model:AccessToken:old-token",
    });
    expect(oldToken).not.toBeNull();
    const newSession = await createPrincipalSession(kernel);
    providerSessionState.failPublications(new Error("atomic binding commit failed"));

    await adapter.stage(newSession, {
      authorizationAttemptId: "attempt-rejected",
      clientId: "client-a",
      oidcConfigVersion: 1,
      providerSessionUid: "provider-session-a",
    });
    const replacement = adapter.consumeStaged({
      accountId: subjectIdentifier,
      authorizationAttemptId: "attempt-rejected",
      clientCode: "client-a",
      providerSessionUid: "provider-session-a",
    });

    await expect(replacement).rejects.toThrow("staged Provider Session binding commit failed");
    await expect(adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier))
      .resolves
      .toMatchObject({ principalSessionId: oldSession.sessionId });
    await expect(adapter.readForAuthorization("provider-session-a", "client-a")).resolves.toMatchObject({
      bindingId: oldBinding?.bindingId,
      principalSessionId: oldSession.sessionId,
    });
    await expect(adapter.resolveAccessTokenCredential("old-token")).resolves.toMatchObject({
      credential: { credentialId: oldToken?.credentialId },
    });
  });

  it("allows only one staged generation to replace the same anchor", async () => {
    const { adapter, kernel } = createFixture();
    const oldSession = await createPrincipalSession(kernel);
    await commitStagedBinding(adapter, "provider-session-a", oldSession, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });
    const contenderA = await createPrincipalSession(kernel);
    const contenderB = await createPrincipalSession(kernel);
    await Promise.all([
      adapter.stage(contenderA, {
        authorizationAttemptId: "attempt-a",
        clientId: "client-a",
        oidcConfigVersion: 1,
        providerSessionUid: "provider-session-a",
      }),
      adapter.stage(contenderB, {
        authorizationAttemptId: "attempt-b",
        clientId: "client-a",
        oidcConfigVersion: 1,
        providerSessionUid: "provider-session-a",
      }),
    ]);

    const results = await Promise.allSettled([
      adapter.consumeStaged({
        accountId: subjectIdentifier,
        authorizationAttemptId: "attempt-a",
        clientCode: "client-a",
        providerSessionUid: "provider-session-a",
      }),
      adapter.consumeStaged({
        accountId: subjectIdentifier,
        authorizationAttemptId: "attempt-b",
        clientCode: "client-a",
        providerSessionUid: "provider-session-a",
      }),
    ]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const committed = results.find(result => result.status === "fulfilled");
    expect(committed).toMatchObject({
      status: "fulfilled",
      value: { principalSessionId: expect.any(String) },
    });
    const winner = committed?.status === "fulfilled"
      ? committed.value?.principalSessionId
      : null;
    await expect(adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier))
      .resolves
      .toMatchObject({ principalSessionId: winner });
    await expect(adapter.readForAuthorization("provider-session-a", "client-a"))
      .resolves
      .toMatchObject({ principalSessionId: winner });
  });

  it("accepts a publication result recovered by the state store", async () => {
    const { adapter, kernel, providerSessionState } = createFixture();
    providerSessionState.recoverNextPublication();
    const session = await createPrincipalSession(kernel);

    const binding = await commitStagedBinding(adapter, "provider-session-a", session, {
      clientId: "client-a",
      oidcConfigVersion: 1,
    });

    expect(binding).not.toBeNull();
    await expect(adapter.readForAuthorization("provider-session-a", "client-a")).resolves.toMatchObject({
      bindingId: binding?.bindingId,
      principalSessionId: session.sessionId,
    });
    await expect(adapter.readPrincipalAnchor("provider-session-a", subjectIdentifier))
      .resolves
      .toMatchObject({
        generation: binding?.anchorGeneration,
        principalSessionId: session.sessionId,
      });
  });
});
