import {
  createSubjectAccessOperations,
  encodeSubjectAccessContext,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { describe, expect, it, vi } from "vitest";
import { createOidcSessionOperations } from "../../src/composition/session/session-operations.ts";
import { isGlobalSessionCookieError } from "../../src/session/global-session-error-provenance.ts";
import { createOidcSessionKernelAdapter } from "../../src/session/oidc-session-kernel.adapter.ts";
import { ProviderSessionStateFake } from "./support/provider-session-state.ts";

function createAdapter(
  reason: "session_generation_stale" | "user_deleted" | "user_disabled"
    = "user_disabled",
) {
  const record = {
    status: "resolved" as const,
    value: {
      principal: { principalType: "user", subjectId: "00000000-0000-4000-8000-000000000007" },
      principalSessionId: "00000000-0000-4000-8000-000000000008",
      subjectContext: encodeSubjectAccessContext({
        version: 1,
        subjectIdentifier: "00000000-0000-4000-8000-000000000007",
        transitionId: "20000000-0000-4000-8000-000000000001",
      }),
    },
  };
  const kernel = {
    revokePrincipalSession: vi.fn(async () => ({ status: "revoked" })),
    createClientBinding: vi.fn(async () => record),
    createProtocolArtifact: vi.fn(async () => record),
    issueCredential: vi.fn(async () => record),
    resolveClientBindingById: vi.fn(async () => record),
    resolveCredential: vi.fn(async () => record),
    resolvePrincipalSession: vi.fn(async () => record),
    resolvePrincipalSessionById: vi.fn(async () => record),
  };
  const providerSessionState = new ProviderSessionStateFake();
  providerSessionState.seedLookup("provider-session-a", "client-a", { bindingId: "binding-a" });
  const operations = createSubjectAccessOperations({
    barrier: { readCommittedTransitionId: async () => {
      if (reason !== "session_generation_stale")
        throw new SubjectAccessDisabledError();
      return "20000000-0000-4000-8000-000000000002";
    } },
    revocation: {
      revokePrincipalSession: async () => { throw new Error("fixture cleanup unavailable"); },
      revokeUserSessions: async () => { throw new Error("fixture cleanup unavailable"); },
    },
  });
  const adapter = createOidcSessionOperations({
    accounts: {
      findBySubject: vi.fn(async () => null),
    },
    clients: {
      findActiveVersion: vi.fn(async () => 1),
      findRuntime: vi.fn(async () => null),
    },
    clock: { now: () => Date.now() },
    cookieName: "global_session",
    kernel,
    logger: { warn: vi.fn() },
    providerSessionState,
  } as never).forOperation(operations.createOperation());
  return { adapter, kernel };
}

describe("oIDC Subject Access Session Adapter", () => {
  it("inspects a valid Principal Session without loading account data", async () => {
    const findBySubject = vi.fn();
    const adapter = createOidcSessionKernelAdapter({
      accounts: { findBySubject },
      clients: { findActiveVersion: vi.fn(), findRuntime: vi.fn() },
      clock: { now: () => Date.now() },
      cookieName: "global_session",
      kernel: {
        resolvePrincipalSession: vi.fn(async () => ({
          status: "resolved",
          value: {},
        })),
      },
      logger: { warn: vi.fn() },
      providerSessionState: new ProviderSessionStateFake(),
    } as never);

    await expect(adapter.inspect({
      headers: { cookie: "global_session=principal-token" },
    })).resolves.toEqual({ status: "valid" });
    expect(findBySubject).not.toHaveBeenCalled();
  });

  it.each([
    ["missing_or_expired", { status: "missing_or_expired" }],
    ["revoked", { status: "revoked", tombstone: {} }],
  ] as const)("classifies a %s cookie as explicitly invalid", async (_label, result) => {
    const adapter = createOidcSessionKernelAdapter({
      accounts: { findBySubject: vi.fn() },
      clients: { findActiveVersion: vi.fn(), findRuntime: vi.fn() },
      clock: { now: () => Date.now() },
      cookieName: "global_session",
      kernel: { resolvePrincipalSession: vi.fn(async () => result) },
      logger: { warn: vi.fn() },
      providerSessionState: new ProviderSessionStateFake(),
    } as never);

    await expect(adapter.inspect({
      headers: { cookie: "global_session=principal-token" },
    })).resolves.toEqual({ status: "invalid" });
  });

  it("keeps an uncertain cookie as unavailable", async () => {
    const secret = "redis://private";
    const adapter = createOidcSessionKernelAdapter({
      accounts: { findBySubject: vi.fn() },
      clients: { findActiveVersion: vi.fn(), findRuntime: vi.fn() },
      clock: { now: () => Date.now() },
      cookieName: "global_session",
      kernel: {
        resolvePrincipalSession: vi.fn(async () => ({
          cause: new Error(secret),
          message: "read outcome unknown",
          status: "fail_closed",
        })),
      },
      logger: { warn: vi.fn() },
      providerSessionState: new ProviderSessionStateFake(),
    } as never);

    const error = await adapter.inspect({
      headers: { cookie: "global_session=principal-token" },
    }).catch(cause => cause);
    expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
    expect(isGlobalSessionCookieError(error)).toBe(true);
  });

  it("keeps uncertain return-handle storage as unavailable without attributing it to the global cookie", async () => {
    const failClosed = {
      cause: new Error("redis unavailable"),
      message: "artifact outcome unknown",
      status: "fail_closed" as const,
    };
    const adapter = createOidcSessionKernelAdapter({
      accounts: { findBySubject: vi.fn() },
      clients: { findActiveVersion: vi.fn(), findRuntime: vi.fn() },
      clock: { now: () => Date.now() },
      cookieName: "global_session",
      kernel: {
        consumeProtocolArtifact: vi.fn(async () => failClosed),
        createProtocolArtifact: vi.fn(async () => failClosed),
        resolveProtocolArtifact: vi.fn(async () => failClosed),
      },
      logger: { warn: vi.fn() },
      providerSessionState: new ProviderSessionStateFake(),
    } as never);
    const payload = {
      browserBinding: "browser-binding",
      clientId: "client-a",
      interactionUid: "interaction-a",
      oidcConfigVersion: 1,
      returnTarget: "https://issuer.example/oidc/resume",
    };

    for (const operation of [
      adapter.create(payload, 60),
      adapter.resolveReturnHandle("return-handle"),
      adapter.consume("return-handle"),
    ]) {
      const error = await operation.catch(cause => cause);
      expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
      expect(isGlobalSessionCookieError(error)).toBe(false);
    }
  });

  it("classifies a disabled subject cookie as explicitly invalid", async () => {
    const { adapter } = createAdapter();

    await expect(adapter.inspect({
      headers: { cookie: "global_session=principal-token" },
    })).resolves.toEqual({ status: "invalid" });
  });

  it("resolves a return handle without consuming it", async () => {
    const metadata = {
      browserBinding: "browser-binding",
      clientId: "client-a",
      interactionUid: "interaction-a",
      oidcConfigVersion: 1,
      returnTarget: "https://issuer.example/oidc/interaction/interaction-a",
    };
    const consumeProtocolArtifact = vi.fn();
    const adapter = createOidcSessionKernelAdapter({
      accounts: { findBySubject: vi.fn() },
      clients: { findActiveVersion: vi.fn(), findRuntime: vi.fn() },
      clock: { now: () => Date.now() },
      cookieName: "global_session",
      kernel: {
        consumeProtocolArtifact,
        resolveProtocolArtifact: vi.fn(async () => ({
          status: "resolved",
          value: {
            artifactType: "login_return_handle",
            metadata,
            protocol: "oidc",
          },
        })),
      },
      logger: { warn: vi.fn() },
      providerSessionState: new ProviderSessionStateFake(),
    } as never);

    await expect(adapter.resolveReturnHandle("return-handle")).resolves.toEqual(metadata);
    expect(consumeProtocolArtifact).not.toHaveBeenCalled();
  });

  it.each([
    "user_disabled",
    "user_deleted",
    "session_generation_stale",
  ] as const)("preserves %s failures for the protocol HTTP boundary", async (reason) => {
    const { adapter } = createAdapter(reason);

    const cookieError = await adapter.resolve({
      headers: { cookie: "global_session=principal-token" },
    }).catch(error => error);
    expect(cookieError).toBeInstanceOf(SubjectAccessDisabledError);
    expect(isGlobalSessionCookieError(cookieError)).toBe(true);

    const byIdError = await createAdapter(reason).adapter.resolveById("principal-a").catch(error => error);
    expect(byIdError).toBeInstanceOf(SubjectAccessDisabledError);
    expect(isGlobalSessionCookieError(byIdError)).toBe(false);
    await expect(adapter.read("provider-session-a", "client-a"))
      .rejects
      .toBeInstanceOf(SubjectAccessDisabledError);
    await expect(adapter.resolveAccessTokenCredential("access-token"))
      .rejects
      .toBeInstanceOf(SubjectAccessDisabledError);
    await expect(adapter.logoutPrincipalSession("principal-token"))
      .resolves
      .toEqual({ status: "revoked" });
  });

  it("preserves disabled failures from every principal-linked create path", async () => {
    const { adapter } = createAdapter();
    const binding = {
      accountId: "subject-a",
      authTime: 1,
      bindingId: "binding-a",
      clientCode: "client-a",
      expiresAt: 10,
      oidcConfigVersion: 1,
      principalSessionId: "principal-a",
    };

    await expect(adapter.stage(
      {
        accountId: "subject-a",
        authTime: 1,
        sessionId: "principal-a",
      },
      {
        authorizationAttemptId: "attempt-a",
        clientId: "client-a",
        oidcConfigVersion: 1,
        providerSessionUid: "provider-session-a",
      },
    )).rejects.toBeInstanceOf(SubjectAccessDisabledError);

    await expect(adapter.registerAuthorizationCodeArtifact({
      binding,
      expiresIn: 60,
      payload: { clientId: "client-a" },
      providerCodeId: "code-a",
    } as never)).rejects.toBeInstanceOf(SubjectAccessDisabledError);

    await expect(adapter.registerAccessTokenCredential({
      binding,
      expiresIn: 60,
      payload: { clientId: "client-a" },
      providerTokenId: "token-a",
      providerTokenKey: "token-key-a",
    } as never)).rejects.toBeInstanceOf(SubjectAccessDisabledError);
  });

  it("keeps uncertain provider-session staging retryable", async () => {
    const adapter = createOidcSessionKernelAdapter({
      accounts: { findBySubject: vi.fn() },
      clients: { findActiveVersion: vi.fn(), findRuntime: vi.fn() },
      clock: { now: () => Date.now() },
      cookieName: "global_session",
      kernel: {
        resolvePrincipalSessionById: vi.fn(async () => ({
          cause: new Error("redis unavailable"),
          message: "read outcome unknown",
          status: "fail_closed",
        })),
      },
      logger: { warn: vi.fn() },
      providerSessionState: new ProviderSessionStateFake(),
    } as never);

    await expect(adapter.stage(
      {
        accountId: "subject-a",
        authTime: 1,
        sessionId: "principal-a",
      },
      {
        authorizationAttemptId: "attempt-a",
        clientId: "client-a",
        oidcConfigVersion: 1,
        providerSessionUid: null,
      },
    )).rejects.toBeInstanceOf(SubjectAccessUnavailableError);
  });
});
