import type { UserService } from "@admin-api/services/user/user.service";
import type { createSubjectAccessOperations, SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { Context, Next } from "hono";
import { AuthzForbiddenError } from "@iam/api-core/errors/AuthzForbiddenError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import {
  createSubjectAccessHttpAdapter,
} from "@iam/api-core/subject-access";
import { UserNotFoundError } from "@iam/domain/user";
import { getCookie, setCookie } from "hono/cookie";

const GLOBAL_SESSION_COOKIE = "global_session";
const ORCAS_SESSION_COOKIE = "orcas_sso_sessionid";
const subjectAccessHttp = createSubjectAccessHttpAdapter();

function clearGlobalSessionCookies(c: Context) {
  for (const cookieName of [GLOBAL_SESSION_COOKIE, ORCAS_SESSION_COOKIE]) {
    setCookie(c, cookieName, "", {
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    });
  }
}

export type AdminAuthenticationHandlers = ReturnType<typeof createAdminRootAuthenticationHandlers>;

export interface CreateAdminRootAuthenticationHandlersDeps {
  subjectAccess: Pick<ReturnType<typeof createSubjectAccessOperations>, "run">;
  userService: Pick<UserService, "getUserDetailForPermittedAdmin">;
  config: { allowedClientCodes: string[] };
  resolveRoot: (token: string, operation: SubjectAccessOperation) => Promise<{
    userSessionId: string;
    subjectIdentifier: string;
    subjectContext: unknown;
  } | null>;
}

export function createAdminRootAuthenticationHandlers(deps: CreateAdminRootAuthenticationHandlersDeps) {
  async function adminAuthenticationHandler(c: Context, next: Next) {
    const clientCode = c.req.header("Client");
    if (!clientCode || !deps.config.allowedClientCodes.includes(clientCode))
      throw new AuthzForbiddenError("无管理端访问权限");

    const sessionCookie = getCookie(c, GLOBAL_SESSION_COOKIE);
    const token = sessionCookie ?? c.req.header("Authorization") ?? null;
    if (!token) {
      clearGlobalSessionCookies(c);
      throw new AuthzUnauthorizedError("未登录");
    }

    return await subjectAccessHttp.run(c, {
      clearCookiesOnInvalidSession: sessionCookie === undefined
        ? []
        : [GLOBAL_SESSION_COOKIE, ORCAS_SESSION_COOKIE],
    }, async () => await deps.subjectAccess.run(async (operation) => {
      const principal = await deps.resolveRoot(token, operation);
      if (principal === null) {
        if (sessionCookie !== undefined)
          clearGlobalSessionCookies(c);
        throw new AuthzUnauthorizedError("未登录");
      }
      await operation.acquireForSession({
        subjectIdentifier: principal.subjectIdentifier,
        subjectContext: principal.subjectContext,
        principalSessionId: principal.userSessionId,
      });
      const user = await deps.userService.getUserDetailForPermittedAdmin(
        operation,
        principal.subjectIdentifier,
      ).catch((error: unknown) => {
        if (error instanceof UserNotFoundError) {
          clearGlobalSessionCookies(c);
          throw new AuthzUnauthorizedError("未登录");
        }
        throw error;
      });
      c.set("userId", user.id);
      c.set("username", user.username);
      c.set("userDetailDto", user);
      c.set("principalSessionId", principal.userSessionId);
      await next();
      if (c.error !== undefined)
        throw c.error;
    }));
  }
  return { adminAuthenticationHandler };
}
