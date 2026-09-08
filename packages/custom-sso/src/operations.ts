import type { SubjectAccessOperation, SubjectAccessPermission } from "@iam/api-core/subject-access";
import type { PermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import type { SessionKernel } from "@iam/session-kernel";
import type { CustomSsoDeps, CustomSsoKernelPort, CustomSsoOrcasUser } from "./custom-sso.port";
import { requireSubjectAccessOperation } from "@iam/api-core/subject-access";
import { createAuthorizationGrantRedemption, createRedisAuthorizationGrantRedemptionStore } from "./grant";
import { createCustomSsoApplication } from "./internal/application";

export interface CustomSsoProjectionPermission {
  readonly operation: SubjectAccessOperation;
  readonly permission: SubjectAccessPermission;
}

export interface CustomSsoOperationsDeps extends Omit<CustomSsoDeps, "kernel" | "subjectProjection"> {
  kernel: SessionKernel;
  subjectProjection: PermittedClientSubjectProjectionService<CustomSsoProjectionPermission>;
  permittedUsers: {
    findOrcasUserBySubjectIdentifier: (subjectIdentifier: string) => Promise<CustomSsoOrcasUser | null>;
  };
}

/** The caller owns the operation lifetime, including deferred subject delivery. */
export function createCustomSsoOperations(deps: CustomSsoOperationsDeps) {
  const authorizationGrantRedemption = createAuthorizationGrantRedemption({
    leaseDurationMs: 5_000,
    random: deps.random,
    store: createRedisAuthorizationGrantRedemptionStore({ redis: deps.redis }),
  });
  function application(operation?: SubjectAccessOperation) {
    return createCustomSsoApplication({
      ...deps,
      authorizationGrantRedemption,
      access: { operation, users: deps.permittedUsers },
      kernel: operation === undefined ? deps.kernel : bindCustomSsoOperationKernel(deps.kernel, operation),
      subjectProjection: {
        async resolve(input) {
          const activeOperation = requireSubjectAccessOperation(operation);
          const permission = activeOperation.requirePermission(input.subjectIdentifier);
          return await deps.subjectProjection.resolve(input, { operation: activeOperation, permission });
        },
      },
    });
  }

  function forOperation(operation: SubjectAccessOperation) {
    requireSubjectAccessOperation(operation);
    const bound = application(operation);
    return {
      exchangeCode: {
        async execute(...args: Parameters<typeof bound.exchangeCode.execute>) {
          requireSubjectAccessOperation(operation);
          return await bound.exchangeCode.execute(...args);
        },
      },
      completeCallback: {
        async execute(...args: Parameters<typeof bound.completeCallback.execute>) {
          requireSubjectAccessOperation(operation);
          return await bound.completeCallback.execute(...args);
        },
      },
      authorize: {
        async execute(...args: Parameters<typeof bound.authorize.execute>) {
          requireSubjectAccessOperation(operation);
          return await bound.authorize.execute(...args);
        },
      },
      checkLoginContinuation: {
        async execute(...args: Parameters<typeof bound.checkLoginContinuation.execute>) {
          requireSubjectAccessOperation(operation);
          return await bound.checkLoginContinuation.execute(...args);
        },
      },
      async authorizeLocalSession(...args: Parameters<typeof bound.authorizeLocalSession>) {
        requireSubjectAccessOperation(operation);
        return await bound.authorizeLocalSession(...args);
      },
      async resolvePublicAuthentication(...args: Parameters<typeof bound.resolvePublicAuthentication>) {
        requireSubjectAccessOperation(operation);
        return await bound.resolvePublicAuthentication(...args);
      },
    };
  }

  return { forOperation, logout: application().logout };
}

export type CustomSsoOperations = ReturnType<typeof createCustomSsoOperations>;

export function bindCustomSsoOperationKernel(kernel: SessionKernel, operation: SubjectAccessOperation): CustomSsoKernelPort {
  async function acquire(value: {
    principal: { subjectId: string };
    subjectContext?: string;
    principalSessionId: string;
  }) {
    await requireSubjectAccessOperation(operation).acquireForSession({
      subjectIdentifier: value.principal.subjectId,
      subjectContext: value.subjectContext,
      principalSessionId: value.principalSessionId,
    });
  }

  return {
    ...kernel,
    async resolvePrincipalSession(token) {
      const result = await kernel.resolvePrincipalSession(token);
      if (result.status === "resolved")
        await acquire(result.value);
      return result;
    },
    async resolvePrincipalSessionById(id) {
      const result = await kernel.resolvePrincipalSessionById(id);
      if (result.status === "resolved")
        await acquire(result.value);
      return result;
    },
    async resolveCredential(token) {
      const result = await kernel.resolveCredential(token);
      if (result.status === "resolved")
        await acquire(result.value);
      return result;
    },
  };
}
