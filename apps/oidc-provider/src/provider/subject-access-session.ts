import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { OidcSessionKernelAdapter } from "../session/oidc-session-kernel.adapter.ts";
import type { OidcSubjectAccessBridge } from "./subject-access-operation.ts";

/** Callback adapters resolve the operation at invocation time, never at construction. */
export function createOidcProviderSessionBridge(
  sessions: {
    forOperation: (operation: SubjectAccessOperation) => OidcSessionKernelAdapter;
    termination: Pick<OidcSessionKernelAdapter, "destroyProviderSession" | "logoutPrincipalSession" | "revokeAccessTokenCredential" | "revokeClientProtocol"
    | "read" | "readPrincipalAnchor">;
  },
  bridge: OidcSubjectAccessBridge,
): OidcSessionKernelAdapter {
  return {
    consumeAuthorizationCodeArtifact: (...args) =>
      sessions.forOperation(bridge.current()).consumeAuthorizationCodeArtifact(...args),
    resolveAuthorizationCodeSessionLifetime: (...args) =>
      sessions.forOperation(bridge.current()).resolveAuthorizationCodeSessionLifetime(...args),
    consume: (...args) => sessions.forOperation(bridge.current()).consume(...args),
    create: (...args) => sessions.forOperation(bridge.current()).create(...args),
    resolveReturnHandle: (...args) => sessions.forOperation(bridge.current()).resolveReturnHandle(...args),
    consumeStaged: (...args) => sessions.forOperation(bridge.current()).consumeStaged(...args),
    destroyProviderSession: sessions.termination.destroyProviderSession,
    ensureClientBinding: (...args) => sessions.forOperation(bridge.current()).ensureClientBinding(...args),
    inspect: (...args) => sessions.forOperation(bridge.current()).inspect(...args),
    isCurrentOrStagedPrincipal: (...args) =>
      sessions.forOperation(bridge.current()).isCurrentOrStagedPrincipal(...args),
    isStagedPrincipal: (...args) => sessions.forOperation(bridge.current()).isStagedPrincipal(...args),
    logoutPrincipalSession: sessions.termination.logoutPrincipalSession,
    read: (...args) => bridge.isLogout()
      ? sessions.termination.read(...args)
      : sessions.forOperation(bridge.current()).read(...args),
    readPrincipalAnchor: (...args) => bridge.isLogout()
      ? sessions.termination.readPrincipalAnchor(...args)
      : sessions.forOperation(bridge.current()).readPrincipalAnchor(...args),
    registerAccessTokenCredential: (...args) =>
      sessions.forOperation(bridge.current()).registerAccessTokenCredential(...args),
    registerAuthorizationCodeArtifact: (...args) =>
      sessions.forOperation(bridge.current()).registerAuthorizationCodeArtifact(...args),
    renew: (...args) => sessions.forOperation(bridge.current()).renew(...args),
    resolve: (...args) => sessions.forOperation(bridge.current()).resolve(...args),
    resolveAccessTokenCredential: (...args) =>
      sessions.forOperation(bridge.current()).resolveAccessTokenCredential(...args),
    resolveById: (...args) => sessions.forOperation(bridge.current()).resolveById(...args),
    revokeAccessTokenCredential: sessions.termination.revokeAccessTokenCredential,
    revokeClientProtocol: sessions.termination.revokeClientProtocol,
    stage: (...args) => sessions.forOperation(bridge.current()).stage(...args),
  };
}
