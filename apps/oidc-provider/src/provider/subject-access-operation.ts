import type { createSubjectAccessOperations, SubjectAccessOperation } from "@iam/api-core/subject-access";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  requireSubjectAccessOperation,
  SubjectAccessPermissionRequiredError,
} from "@iam/api-core/subject-access";
import Provider from "oidc-provider";

/** Provider requests use its state slot; native calls explicitly own a separate scope. */
export function createOidcSubjectAccessBridge(operations: ReturnType<typeof createSubjectAccessOperations>) {
  const operationKey = Symbol("oidcSubjectAccessOperation");
  // Native Provider APIs invoke storage callbacks without entering Provider's ALS.
  const nativeOperation = new AsyncLocalStorage<ReturnType<typeof operations.createOperation>>();
  return {
    authorizationCodeRequest() {
      const oidc = Provider.ctx?.oidc;
      if (oidc?.route !== "token" || oidc.params?.grant_type !== "authorization_code")
        return undefined;
      return {
        clientCode: oidc.client?.clientId ?? "",
        code: typeof oidc.params.code === "string" ? oidc.params.code : "",
        redirectUri: typeof oidc.params.redirect_uri === "string" ? oidc.params.redirect_uri : "",
      };
    },
    isLogout() {
      const route = Provider.ctx?.oidc?.route;
      return route === "end_session" || route === "end_session_confirm";
    },
    request() {
      const request = Provider.ctx?.req;
      if (!request)
        throw new SubjectAccessPermissionRequiredError();
      return request;
    },
    current() {
      let state: Record<PropertyKey, unknown> | undefined;
      try {
        state = Provider.ctx?.state;
      }
      catch {
        throw new SubjectAccessPermissionRequiredError();
      }
      const operation = state?.[operationKey] ?? nativeOperation.getStore();
      return requireSubjectAccessOperation(
        operation as Parameters<typeof requireSubjectAccessOperation>[0],
      );
    },
    register(provider: Provider) {
      provider.middleware.unshift(async (ctx, next) => {
        await operations.run(async (operation) => {
          Reflect.set(ctx.state, operationKey, operation);
          try {
            await next();
          }
          finally {
            Reflect.deleteProperty(ctx.state, operationKey);
          }
        });
      });
    },
    run<Result>(callback: (operation: SubjectAccessOperation) => Promise<Result>) {
      return operations.run(operation => nativeOperation.run(operation, () => callback(operation)));
    },
  };
}

export type OidcSubjectAccessBridge = ReturnType<typeof createOidcSubjectAccessBridge>;
