import {
  createSubjectAccessOperations,
  createSubjectAccessSessionRevocation,
  encodeSubjectAccessContext,
  SubjectAccessDisabledError,
  SubjectAccessOperationDeniedError,
  SubjectAccessPermissionRequiredError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { createSessionKernelConfig } from "@iam/session-kernel";
import { createSessionKernelForTesting } from "@iam/session-kernel/testing";
import { describe, expect, it, vi } from "vitest";
import { createOidcSessionOperations } from "../../src/composition/session/session-operations.ts";
import { clientRuntime } from "./support/client-runtime.ts";
import { KernelRedis } from "./support/kernel-redis.ts";
import { ProviderSessionStateFake } from "./support/provider-session-state.ts";

const subjectIdentifier = "00000000-0000-4000-8000-000000000007";
const transitionId = "20000000-0000-4000-8000-000000000001";

async function fixture() {
  const redis = new KernelRedis();
  const kernel = createSessionKernelForTesting({
    redis,
    config: createSessionKernelConfig({
      principalIdleTtlMs: 60_000,
      principalAbsoluteTtlMs: 300_000,
      tombstoneTtlMs: 60_000,
      tombstoneGraceMs: 5_000,
      clock: { now: () => redis.now },
    }),
  });
  const created = await kernel.createPrincipalSession(subjectIdentifier, {
    subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId }),
  });
  if (created.status !== "created" || !created.externalToken)
    throw new Error("Principal fixture creation failed");
  const state = new ProviderSessionStateFake();
  const readCommittedTransitionId = vi.fn(async (_subject: string) => transitionId);
  const scopes = createSubjectAccessOperations({
    barrier: { readCommittedTransitionId },
    revocation: createSubjectAccessSessionRevocation(kernel),
  });
  const sessions = createOidcSessionOperations({
    kernel,
    accounts: { findBySubject: async () => ({
      id: 7,
      isDelete: false,
      mobile: null,
      name: "Alice",
      status: 1,
      subjectIdentifier,
      username: "alice",
    }) },
    clients: { findActiveVersion: async () => 1, findRuntime: async client => clientRuntime(client) },
    cookieName: "global_session",
    logger: { warn: () => undefined },
    providerSessionState: state,
  });
  const session = {
    accountId: subjectIdentifier,
    authTime: created.value.authTime / 1000,
    sessionId: created.value.principalSessionId,
  };
  const context = { authorizationAttemptId: "attempt-a", clientId: "client-a", oidcConfigVersion: 1, providerSessionUid: "provider-a" };
  const claim = {
    accountId: subjectIdentifier,
    authorizationAttemptId: "attempt-a",
    clientCode: "client-a",
    providerSessionUid: "provider-a",
  };
  return {
    kernel,
    scopes,
    sessions,
    state,
    session,
    context,
    claim,
    readCommittedTransitionId,
    token: created.externalToken,
  };
}

describe("oIDC operation-bound Session lifecycle", () => {
  it("shares one permission across resolution, renewal, staging, claiming and binding refresh", async () => {
    const f = await fixture();
    const operation = f.scopes.createOperation();
    const adapter = f.sessions.forOperation(operation);
    const resolved = await adapter.resolve({ headers: { cookie: `global_session=${f.token}` } });
    expect(resolved).toEqual(f.session);
    f.readCommittedTransitionId.mockRejectedValue(new SubjectAccessDisabledError());
    expect(await adapter.renew(f.session.sessionId)).toBe(true);
    expect(await adapter.stage(f.session, f.context)).not.toBeNull();
    const binding = await adapter.consumeStaged(f.claim);
    expect(binding?.accountId).toBe(subjectIdentifier);
    expect(await adapter.readForAuthorization("provider-a", "client-a")).toEqual(binding);
    expect(f.readCommittedTransitionId).toHaveBeenCalledTimes(1);
    const next = f.sessions.forOperation(f.scopes.createOperation());
    const denied = await next.resolveById(f.session.sessionId).catch(error => error);
    expect(denied).toBeInstanceOf(SubjectAccessOperationDeniedError);
    expect(f.readCommittedTransitionId).toHaveBeenCalledTimes(2);
  });

  it("rejects unavailable subjects before staged payload claim or renewal", async () => {
    const f = await fixture();
    await f.sessions.forOperation(f.scopes.createOperation()).stage(f.session, f.context);
    const claim = vi.spyOn(f.state, "claim");
    const renew = vi.spyOn(f.kernel, "renewPrincipalSession");
    f.readCommittedTransitionId.mockRejectedValue(new SubjectAccessUnavailableError());
    const adapter = f.sessions.forOperation(f.scopes.createOperation());
    const denied = await adapter.consumeStaged(f.claim).catch(error => error);
    expect(denied).toBeInstanceOf(SubjectAccessUnavailableError);
    expect(claim).not.toHaveBeenCalled();
    expect(await f.state.readStaged("attempt-a")).not.toBeNull();
    const renewalError = await adapter.renew(f.session.sessionId).catch(error => error);
    expect(renewalError).toBeInstanceOf(SubjectAccessUnavailableError);
    expect(renew).not.toHaveBeenCalled();
    expect(f.readCommittedTransitionId).toHaveBeenCalledTimes(2);
  });

  it("checks a code artifact before consumption and preserves it on temporary denial", async () => {
    const f = await fixture();
    const code = await f.kernel.createProtocolArtifact({
      principalSessionId: f.session.sessionId,
      protocol: "oidc",
      clientCode: "client-a",
      artifactType: "authorization_code",
      tokenKind: "authCode",
      externalToken: "provider-code-a",
      ttlMs: 30_000,
      metadata: { providerCodeId: "provider-code-a", clientId: "client-a", oidcConfigVersion: 1 },
    });
    expect(code.status).toBe("created");
    if (code.status !== "created")
      throw new Error("expected code");
    const consume = vi.spyOn(f.kernel, "consumeProtocolArtifact");
    f.readCommittedTransitionId.mockRejectedValue(new SubjectAccessUnavailableError());
    const adapter = f.sessions.forOperation(f.scopes.createOperation());
    const denied = await adapter.consumeAuthorizationCodeArtifact("provider-code-a", code.value).catch(error => error);
    expect(denied).toBeInstanceOf(SubjectAccessUnavailableError);
    expect(consume).not.toHaveBeenCalled();
    const retained = await f.kernel.resolveProtocolArtifact("provider-code-a", { protocol: "oidc", artifactType: "authorization_code" });
    expect(retained.status).toBe("resolved");
  });

  it("rejects an old context before renewing a session after re-enable", async () => {
    const f = await fixture();
    f.readCommittedTransitionId.mockResolvedValue("20000000-0000-4000-8000-000000000002");
    const renew = vi.spyOn(f.kernel, "renewPrincipalSession");
    const adapter = f.sessions.forOperation(f.scopes.createOperation());
    const denied = await adapter.renew(f.session.sessionId).catch(error => error);
    expect(denied).toMatchObject({ reason: "session_generation_stale" });
    expect(renew).not.toHaveBeenCalled();
    const revoked = await f.kernel.resolvePrincipalSessionById(f.session.sessionId);
    expect(revoked.status).toBe("revoked");
  });

  it("keeps logout and subjectless return handles independent of Subject Access", async () => {
    const f = await fixture();
    f.readCommittedTransitionId.mockRejectedValue(new SubjectAccessDisabledError());
    const adapter = f.sessions.forOperation(f.scopes.createOperation());
    const payload = {
      browserBinding: "browser",
      clientId: "client-a",
      interactionUid: "interaction",
      oidcConfigVersion: 1,
      returnTarget: "https://issuer.example/resume",
    };
    const handle = await adapter.create(payload, 60);
    if (!handle)
      throw new Error("Return handle missing");
    const resolved = await adapter.resolveReturnHandle(handle, payload);
    expect(resolved).toEqual(payload);
    if (!resolved)
      throw new Error("expected handle");
    expect(await adapter.consume(handle, resolved)).toEqual(payload);
    const logout = await adapter.logoutPrincipalSession(f.token);
    expect(logout).not.toBe(true);
    expect(f.readCommittedTransitionId).not.toHaveBeenCalled();
  });

  it("closes all state-only session capabilities while retaining logout", async () => {
    const f = await fixture();
    const operation = f.scopes.createOperation();
    const adapter = f.sessions.forOperation(operation);
    await adapter.stage(f.session, f.context);
    const reads = [vi.spyOn(f.state, "readAnchor"), vi.spyOn(f.state, "readLookup"), vi.spyOn(f.state, "readStaged")];
    operation.close();
    const results = await Promise.all([
      adapter.readPrincipalAnchor("provider-a", subjectIdentifier),
      adapter.isStagedPrincipal("attempt-a", "client-a", f.session),
      adapter.isCurrentOrStagedPrincipal("provider-a", "client-a", f.session, "attempt-a"),
      adapter.readForAuthorization("provider-a", "client-a"),
      adapter.inspect({ headers: {} }),
      adapter.stage(f.session, { ...f.context, authorizationAttemptId: undefined }),
    ].map(result => result.catch(error => error)));
    for (const result of results)
      expect(result).toBeInstanceOf(SubjectAccessPermissionRequiredError);
    for (const read of reads)
      expect(read).not.toHaveBeenCalled();
    const logout = await adapter.logoutPrincipalSession(f.token);
    expect(logout).not.toBe(true);
  });

  it("validates the actual principal context before delivering a matching staged identity", async () => {
    const f = await fixture();
    await f.sessions.forOperation(f.scopes.createOperation()).stage(f.session, f.context);
    f.readCommittedTransitionId.mockResolvedValue("20000000-0000-4000-8000-000000000002");
    const adapter = f.sessions.forOperation(f.scopes.createOperation());
    const result = await adapter.isStagedPrincipal("attempt-a", "client-a", f.session).catch(error => error);
    expect(result).toMatchObject({ reason: "session_generation_stale" });
  });

  it("rejects closed scopes and caller identities that disagree with the resolved principal", async () => {
    const f = await fixture();
    const operation = f.scopes.createOperation();
    const adapter = f.sessions.forOperation(operation);
    const stage = vi.spyOn(f.state, "stage");
    const error = await adapter.stage({
      ...f.session,
      accountId: "00000000-0000-4000-8000-000000000008",
    }, f.context).catch(error => error);
    expect(error).toBeInstanceOf(SubjectAccessOperationDeniedError);
    expect(stage).not.toHaveBeenCalled();
    operation.close();
    const closedError = await adapter.renew(f.session.sessionId).catch(error => error);
    expect(closedError).toBeInstanceOf(SubjectAccessPermissionRequiredError);
  });
});
