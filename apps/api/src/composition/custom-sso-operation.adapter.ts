import type { CreateApiAuthenticationHandlersDeps } from "@api/middlewares/authentication.handler";
import type { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import type { CustomSsoOperations } from "@iam/custom-sso";
import type { Context, Next } from "hono";
import { createApiAuthenticationHandlers } from "@api/middlewares/authentication.handler";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";

interface CustomSsoOperationAdapterDeps {
  subjectAccessOperations: ReturnType<typeof createSubjectAccessOperations>;
  customSsoOperations: CustomSsoOperations;
}

/** Each call owns its permission until all protected work has completed. */
export function createCustomSsoOperationAdapter(deps: CustomSsoOperationAdapterDeps) {
  const { subjectAccessOperations: operations, customSsoOperations: sso } = deps;
  type ScopedSso = ReturnType<CustomSsoOperations["forOperation"]>;
  return {
    exchangeCode: {
      execute: (...args: Parameters<ScopedSso["exchangeCode"]["execute"]>) =>
        operations.run(async operation => await sso.forOperation(operation).exchangeCode.execute(...args)),
    },
    completeCallback: {
      execute: (...args: Parameters<ScopedSso["completeCallback"]["execute"]>) =>
        operations.run(async operation => await sso.forOperation(operation).completeCallback.execute(...args)),
    },
    authorize: {
      execute: (...args: Parameters<ScopedSso["authorize"]["execute"]>) =>
        operations.run(async operation => await sso.forOperation(operation).authorize.execute(...args)),
    },
    checkLoginContinuation: {
      execute: (...args: Parameters<ScopedSso["checkLoginContinuation"]["execute"]>) =>
        operations.run(async operation => await sso.forOperation(operation).checkLoginContinuation.execute(...args)),
    },
    authorizeLocalSession: (...args: Parameters<ScopedSso["authorizeLocalSession"]>) =>
      operations.run(async operation => await sso.forOperation(operation).authorizeLocalSession(...args)),
    logout: sso.logout,
  };
}

/** Public UserInfo defers delivery to next(), so the request owns the entire scope. */
export function createApiOperationAuthenticationHandlers(
  deps: Omit<CreateApiAuthenticationHandlersDeps, "customSsoSession"> & CustomSsoOperationAdapterDeps,
) {
  return {
    internalAuthenticationHandler: createInternalAuthenticationHandler({ getClientBySecret: deps.clientService.getClientBySecret }),
    publicAuthenticationHandler: async (context: Context, next: Next) =>
      await deps.subjectAccessOperations.run(async (operation) => {
        const handlers = createApiAuthenticationHandlers({
          ...deps,
          customSsoSession: deps.customSsoOperations.forOperation(operation),
        });
        return await handlers.publicAuthenticationHandler(context, next);
      }),
  };
}
