import type { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import {
  requireSubjectAccessOperation,
  SubjectAccessPermissionRequiredError,
} from "@iam/api-core/subject-access";
import Provider from "oidc-provider";

/** The Provider owns ALS; this bridge owns only the request's state slot. */
export function createOidcSubjectAccessBridge(operations: ReturnType<typeof createSubjectAccessOperations>) {
  const operationKey = Symbol("oidcSubjectAccessOperation");
  return {
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
      const operation = state?.[operationKey];
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
    run: operations.run,
  };
}

export type OidcSubjectAccessBridge = ReturnType<typeof createOidcSubjectAccessBridge>;
