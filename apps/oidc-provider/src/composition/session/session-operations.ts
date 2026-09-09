import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { PrincipalRef, ResolveResult } from "@iam/session-kernel";
import type {
  OidcSessionKernelAdapterDeps,
  OidcSessionLifecycle,
} from "../../session/oidc-session-kernel.adapter.ts";
import {
  requireSubjectAccessOperation,
  SubjectAccessOperationDeniedError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { createOidcOperationSnapshots } from "../../provider/client/operation-snapshots.ts";
import { createOidcSessionKernelAdapter } from "../../session/oidc-session-kernel.adapter.ts";

export type OidcSessionOperationsDeps = Omit<OidcSessionKernelAdapterDeps, "kernel"> & {
  kernel: OidcSessionLifecycle;
};

type SubjectSession = {
  principal?: PrincipalRef;
  principalSessionId?: string;
  subjectContext?: string;
};

/** The caller owns one operation per HTTP request, including native interaction requests. */
export function createOidcSessionOperations(deps: OidcSessionOperationsDeps) {
  const neutral = createOidcSessionKernelAdapter(deps);
  const snapshots = createOidcOperationSnapshots(deps);
  const adapters = new WeakMap<SubjectAccessOperation, ReturnType<typeof createOidcSessionKernelAdapter>>();

  function forOperation(value: SubjectAccessOperation) {
    const operation = requireSubjectAccessOperation(value);
    const existing = adapters.get(operation);
    if (existing)
      return existing;

    function scoped<Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>) {
      return async (...args: Args): Promise<Result> => {
        requireSubjectAccessOperation(operation);
        const result = await run(...args);
        requireSubjectAccessOperation(operation);
        return result;
      };
    }

    async function permit(record: SubjectSession) {
      requireSubjectAccessOperation(operation);
      if (!record.principal && !record.principalSessionId)
        return;
      if (!record.principal || !record.principalSessionId)
        throw new SubjectAccessUnavailableError();
      await operation.acquireForSession({
        subjectIdentifier: record.principal.subjectId,
        subjectContext: record.subjectContext,
        principalSessionId: record.principalSessionId,
      });
    }

    async function checked<T extends SubjectSession>(result: ResolveResult<T>) {
      requireSubjectAccessOperation(operation);
      if (result.status === "resolved")
        await permit(result.value);
      return result;
    }

    async function principal(id: string, accountId?: string) {
      const result = await checked(await deps.kernel.resolvePrincipalSessionById(id));
      if (result.status === "fail_closed")
        throw new SubjectAccessUnavailableError(result.cause);
      if (result.status !== "resolved")
        return false;
      if (accountId !== undefined && result.value.principal.subjectId !== accountId)
        throw new SubjectAccessOperationDeniedError("identity_mismatch");
      return true;
    }

    const kernel: OidcSessionLifecycle = {
      ...deps.kernel,
      resolvePrincipalSession: async token => checked(await deps.kernel.resolvePrincipalSession(token)),
      resolvePrincipalSessionById: async id => checked(await deps.kernel.resolvePrincipalSessionById(id)),
      async renewPrincipalSession(id) {
        if (!await principal(id))
          return { status: "missing_or_expired" };
        return await deps.kernel.renewPrincipalSession(id);
      },
      async createClientBinding(input) {
        if (!await principal(input.principalSessionId))
          return { status: "missing_or_expired" };
        return await deps.kernel.createClientBinding(input);
      },
      async createProtocolArtifact(input) {
        requireSubjectAccessOperation(operation);
        if (input.principalSessionId && !await principal(input.principalSessionId))
          return { status: "missing_or_expired" };
        if (input.bindingId) {
          const binding = await checked(await deps.kernel.resolveClientBindingById(input.bindingId, { protocol: input.protocol, clientCode: input.clientCode }));
          if (binding.status !== "resolved")
            return binding;
        }
        return await deps.kernel.createProtocolArtifact(input);
      },
      async issueCredential(input) {
        if (!await principal(input.principalSessionId))
          return { status: "missing_or_expired" };
        if (input.bindingId) {
          const binding = await checked(await deps.kernel.resolveClientBindingById(input.bindingId, { protocol: input.protocol, clientCode: input.clientCode }));
          if (binding.status !== "resolved")
            return binding;
        }
        return await deps.kernel.issueCredential(input);
      },
    };

    const adapter = createOidcSessionKernelAdapter({
      ...deps,
      ...snapshots.forOperation(operation),
      kernel,
      permit,
      providerSessionState: {
        ...deps.providerSessionState,
        claim: async (input) => {
          const staged = await deps.providerSessionState.readStaged(input.authorizationAttemptId);
          if (!staged || staged.accountId !== input.accountId || staged.clientCode !== input.clientCode
            || (staged.providerSessionUid !== null && staged.providerSessionUid !== input.providerSessionUid)) {
            return null;
          }
          if (!await principal(staged.principalSessionId, staged.accountId))
            return null;
          return await deps.providerSessionState.claim(input);
        },
        stage: async (staged, expiresAt) => {
          if (!await principal(staged.principalSessionId, staged.accountId))
            throw new SubjectAccessUnavailableError();
          return await deps.providerSessionState.stage(staged, expiresAt);
        },
        // Preserve prototype-based state stores as well as object implementations.
        deleteOwned: input => deps.providerSessionState.deleteOwned(input),
        destroyProviderSession: (uid, expected) => deps.providerSessionState.destroyProviderSession(uid, expected),
        publishClientBinding: input => deps.providerSessionState.publishClientBinding(input),
        publishRebind: input => deps.providerSessionState.publishRebind(input),
        readAnchor: scoped(uid => deps.providerSessionState.readAnchor(uid)),
        readLookup: scoped((uid, client) => deps.providerSessionState.readLookup(uid, client)),
        readStaged: scoped(id => deps.providerSessionState.readStaged(id)),
        refresh: input => deps.providerSessionState.refresh(input),
      },
    });
    const scopedAdapter = {
      consumeAuthorizationCodeArtifact: scoped(adapter.consumeAuthorizationCodeArtifact),
      resolveAuthorizationCodeSessionLifetime: scoped(adapter.resolveAuthorizationCodeSessionLifetime),
      consume: scoped(adapter.consume),
      create: scoped(adapter.create),
      resolveReturnHandle: scoped(adapter.resolveReturnHandle),
      consumeStaged: scoped(adapter.consumeStaged),
      ensureClientBinding: scoped(adapter.ensureClientBinding),
      inspect: scoped(adapter.inspect),
      isCurrentOrStagedPrincipal: scoped(async (uid, clientId, session, attemptId) => {
        if (!await adapter.isCurrentOrStagedPrincipal(uid, clientId, session, attemptId))
          return false;
        return await principal(session.sessionId, session.accountId);
      }),
      isStagedPrincipal: scoped(async (attemptId, clientId, session) => {
        if (!await adapter.isStagedPrincipal(attemptId, clientId, session))
          return false;
        return await principal(session.sessionId, session.accountId);
      }),
      read: scoped(adapter.read),
      readPrincipalAnchor: scoped(async (uid, accountId) => {
        const anchor = await adapter.readPrincipalAnchor(uid, accountId);
        return anchor && await principal(anchor.principalSessionId, anchor.accountId) ? anchor : null;
      }),
      registerAccessTokenCredential: scoped(adapter.registerAccessTokenCredential),
      registerAuthorizationCodeArtifact: scoped(adapter.registerAuthorizationCodeArtifact),
      renew: scoped(adapter.renew),
      stage: scoped(adapter.stage),
      resolve: scoped(adapter.resolve),
      resolveAccessTokenCredential: scoped(adapter.resolveAccessTokenCredential),
      resolveById: scoped(adapter.resolveById),
      destroyProviderSession: neutral.destroyProviderSession,
      logoutPrincipalSession: neutral.logoutPrincipalSession,
      revokeAccessTokenCredential: neutral.revokeAccessTokenCredential,
      revokeClientProtocol: neutral.revokeClientProtocol,
    } satisfies ReturnType<typeof createOidcSessionKernelAdapter>;
    adapters.set(operation, scopedAdapter);
    return scopedAdapter;
  }

  return {
    forOperation,
    snapshotsForOperation: snapshots.forOperation,
    terminationForOperation(operation: SubjectAccessOperation) {
      const adapter = createOidcSessionKernelAdapter({ ...deps, ...snapshots.forOperation(operation) });
      function scoped<Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>) {
        return async (...args: Args) => {
          requireSubjectAccessOperation(operation);
          try {
            return await run(...args);
          }
          finally {
            requireSubjectAccessOperation(operation);
          }
        };
      }
      return { read: scoped(adapter.read), readPrincipalAnchor: scoped(adapter.readPrincipalAnchor) };
    },
    termination: {
      destroyProviderSession: neutral.destroyProviderSession,
      logoutPrincipalSession: neutral.logoutPrincipalSession,
      revokeAccessTokenCredential: neutral.revokeAccessTokenCredential,
      revokeClientProtocol: neutral.revokeClientProtocol,
      read: neutral.read,
      readPrincipalAnchor: neutral.readPrincipalAnchor,
    },
  };
}

export type OidcSessionOperations = ReturnType<typeof createOidcSessionOperations>;
