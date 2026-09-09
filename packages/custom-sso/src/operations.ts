import type { SubjectAccessOperation, SubjectAccessPermission } from "@iam/api-core/subject-access";
import type { PermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import type { SessionKernel } from "@iam/session-kernel";
import type { CustomSsoDeps, CustomSsoKernelPort, CustomSsoOrcasUser } from "./custom-sso.port";
import { requireSubjectAccessOperation } from "@iam/api-core/subject-access";
import { createCustomSsoApplication } from "./internal/application";
import { CustomSsoTrafficGateUnavailableError } from "./internal/traffic-gate";
import { CustomSsoConfigurationUnavailableError } from "./protocol-validation.error";

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
  function application(operation?: SubjectAccessOperation) {
    const clients = new Map<string, ReturnType<typeof deps.clients.findRuntimeRecord>>();
    const traffic = new Map<string, ReturnType<typeof deps.traffic.check>>();
    return createCustomSsoApplication({
      ...deps,
      clients: { findRuntimeRecord(clientCode) {
        let result = clients.get(clientCode);
        if (!result) {
          result = Promise.resolve().then(() => deps.clients.findRuntimeRecord(clientCode)).then(value => structuredClone(value)).catch((cause: unknown) => {
            throw new CustomSsoConfigurationUnavailableError({ cause });
          });
          clients.set(clientCode, result);
        }
        return result;
      } },
      traffic: { check(clientCode) {
        let result = traffic.get(clientCode);
        if (!result) {
          result = Promise.resolve().then(() => deps.traffic.check(clientCode)).then(value => structuredClone(value)).catch((cause: unknown) => {
            throw new CustomSsoTrafficGateUnavailableError({ cause });
          });
          traffic.set(clientCode, result);
        }
        return result;
      } },
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

  const applications = new WeakMap<SubjectAccessOperation, ReturnType<typeof application>>();
  function forOperation(operation: SubjectAccessOperation) {
    requireSubjectAccessOperation(operation);
    let bound = applications.get(operation);
    if (!bound) {
      bound = application(operation);
      applications.set(operation, bound);
    }
    const active = bound;
    return {
      exchangeCode: {
        async execute(...args: Parameters<typeof active.exchangeCode.execute>) {
          requireSubjectAccessOperation(operation);
          return await active.exchangeCode.execute(...args);
        },
      },
      completeCallback: {
        async execute(...args: Parameters<typeof active.completeCallback.execute>) {
          requireSubjectAccessOperation(operation);
          return await active.completeCallback.execute(...args);
        },
      },
      authorize: {
        async execute(...args: Parameters<typeof active.authorize.execute>) {
          requireSubjectAccessOperation(operation);
          return await active.authorize.execute(...args);
        },
      },
      checkLoginContinuation: {
        async execute(...args: Parameters<typeof active.checkLoginContinuation.execute>) {
          requireSubjectAccessOperation(operation);
          return await active.checkLoginContinuation.execute(...args);
        },
      },
      async authorizeLocalSession(...args: Parameters<typeof active.authorizeLocalSession>) {
        requireSubjectAccessOperation(operation);
        return await active.authorizeLocalSession(...args);
      },
      async resolvePublicAuthentication(...args: Parameters<typeof active.resolvePublicAuthentication>) {
        requireSubjectAccessOperation(operation);
        return await active.resolvePublicAuthentication(...args);
      },
    };
  }

  return { forOperation, logout: {
    async execute(...args: Parameters<ReturnType<typeof application>["logout"]["execute"]>) {
      return await application().logout.execute(...args);
    },
  } };
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
  };
}
