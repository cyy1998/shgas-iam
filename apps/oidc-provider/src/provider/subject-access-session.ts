import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { OidcSessionKernelAdapter } from "../session/oidc-session-kernel.adapter.ts";
import type { OidcSubjectAccessBridge } from "./subject-access-operation.ts";

/** Callback adapters resolve the operation at invocation time, never at construction. */
export function createOidcProviderSessionBridge(
  sessions: {
    forOperation: (operation: SubjectAccessOperation) => OidcSessionKernelAdapter;
    terminationForOperation: (operation: SubjectAccessOperation) => Pick<OidcSessionKernelAdapter, "read" | "readPrincipalAnchor">;
    termination: Pick<OidcSessionKernelAdapter, "destroyProviderSession" | "logoutPrincipalSession" | "revokeAccessTokenCredential" | "revokeClientProtocol"
    | "read" | "readPrincipalAnchor">;
  },
  bridge: OidcSubjectAccessBridge,
): OidcSessionKernelAdapter {
  const adapters = new WeakMap<SubjectAccessOperation, OidcSessionKernelAdapter>();
  function currentAdapter() {
    const operation = bridge.current();
    let adapter = adapters.get(operation);
    if (!adapter) {
      adapter = sessions.forOperation(operation);
      adapters.set(operation, adapter);
    }
    return adapter;
  }
  return {
    consumeAuthorizationCodeArtifact: (...args) =>
      currentAdapter().consumeAuthorizationCodeArtifact(...args),
    resolveAuthorizationCodeSessionLifetime: (...args) =>
      currentAdapter().resolveAuthorizationCodeSessionLifetime(args[0], args[1], bridge.authorizationCodeRequest()),
    consume: (...args) => currentAdapter().consume(...args),
    create: (...args) => currentAdapter().create(...args),
    resolveReturnHandle: (...args) => currentAdapter().resolveReturnHandle(...args),
    consumeStaged: (...args) => currentAdapter().consumeStaged(...args),
    destroyProviderSession: sessions.termination.destroyProviderSession,
    ensureClientBinding: (...args) => currentAdapter().ensureClientBinding(...args),
    inspect: (...args) => currentAdapter().inspect(...args),
    isCurrentOrStagedPrincipal: (...args) =>
      currentAdapter().isCurrentOrStagedPrincipal(...args),
    isStagedPrincipal: (...args) => currentAdapter().isStagedPrincipal(...args),
    logoutPrincipalSession: sessions.termination.logoutPrincipalSession,
    read: (...args) => bridge.isLogout()
      ? sessions.terminationForOperation(bridge.current()).read(...args)
      : currentAdapter().read(...args),
    readPrincipalAnchor: (...args) => bridge.isLogout()
      ? sessions.terminationForOperation(bridge.current()).readPrincipalAnchor(...args)
      : currentAdapter().readPrincipalAnchor(...args),
    registerAccessTokenCredential: (...args) =>
      currentAdapter().registerAccessTokenCredential(...args),
    registerAuthorizationCodeArtifact: (...args) =>
      currentAdapter().registerAuthorizationCodeArtifact(...args),
    renew: (...args) => currentAdapter().renew(...args),
    resolve: (...args) => currentAdapter().resolve(...args),
    resolveAccessTokenCredential: (...args) =>
      currentAdapter().resolveAccessTokenCredential(...args),
    resolveById: (...args) => currentAdapter().resolveById(...args),
    revokeAccessTokenCredential: sessions.termination.revokeAccessTokenCredential,
    revokeClientProtocol: sessions.termination.revokeClientProtocol,
    stage: (...args) => currentAdapter().stage(...args),
  };
}
