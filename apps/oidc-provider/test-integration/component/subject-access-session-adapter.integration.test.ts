import { SubjectAccessDisabledError } from "@iam/api-core/subject-access";
import { describe, expect, it, vi } from "vitest";
import { isGlobalSessionCookieError } from "../../src/session/global-session-error-provenance.ts";
import { createOidcSessionKernelAdapter } from "../../src/session/oidc-session-kernel.adapter.ts";
import { ProviderSessionStateFake } from "./support/provider-session-state.ts";

function createAdapter(
  reason: "session_generation_stale" | "user_deleted" | "user_disabled"
    = "user_disabled",
) {
  const validationFailure = {
    status: "validation_failed" as const,
    reason,
  };
  const kernel = {
    createClientBinding: vi.fn(async () => validationFailure),
    createProtocolArtifact: vi.fn(async () => validationFailure),
    issueCredential: vi.fn(async () => validationFailure),
    resolveClientBindingById: vi.fn(async () => validationFailure),
    resolveCredential: vi.fn(async () => validationFailure),
    resolvePrincipalSession: vi.fn(async () => validationFailure),
    resolvePrincipalSessionById: vi.fn(async () => validationFailure),
  };
  const providerSessionState = new ProviderSessionStateFake();
  providerSessionState.seedLookup("provider-session-a", "client-a", { bindingId: "binding-a" });
  const adapter = createOidcSessionKernelAdapter({
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
  } as never);
  return { adapter, kernel };
}

describe("oIDC Subject Access Session Adapter", () => {
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

    const byIdError = await adapter.resolveById("principal-a")
      .catch(error => error);
    expect(byIdError).toBeInstanceOf(SubjectAccessDisabledError);
    expect(isGlobalSessionCookieError(byIdError)).toBe(false);
    await expect(adapter.read("provider-session-a", "client-a"))
      .rejects
      .toBeInstanceOf(SubjectAccessDisabledError);
    await expect(adapter.resolveAccessTokenCredential("access-token"))
      .rejects
      .toBeInstanceOf(SubjectAccessDisabledError);
    await expect(adapter.logoutPrincipalSession("principal-token"))
      .rejects
      .toBeInstanceOf(SubjectAccessDisabledError);
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
});
