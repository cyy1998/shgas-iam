import type { UserService } from "@admin-api/services/user/user.service";
import type { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import type { SessionKernel } from "@iam/session-kernel";
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

export type AdminAuthenticationHandlers = ReturnType<typeof createAdminAuthenticationHandlers>;

export interface CreateAdminAuthenticationHandlersDeps {
  sessionKernel: Pick<SessionKernel, "resolvePrincipalSession">;
  subjectAccess: Pick<ReturnType<typeof createSubjectAccessOperations>, "run">;
  userService: Pick<UserService, "getUserDetailForPermittedAdmin">;
  config: { allowedClientCodes: string[] };
}

export function createAdminAuthenticationHandlers(
  deps: CreateAdminAuthenticationHandlersDeps,
) {
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
      const resolved = await deps.sessionKernel.resolvePrincipalSession(token);
      if (resolved.status !== "resolved" || resolved.value.principal.principalType !== "user") {
        if (sessionCookie !== undefined)
          clearGlobalSessionCookies(c);
        throw new AuthzUnauthorizedError("未登录");
      }
      const principal = resolved.value;
      await operation.acquireForSession({
        subjectIdentifier: principal.principal.subjectId,
        subjectContext: principal.subjectContext,
        principalSessionId: principal.principalSessionId,
      });
      const user = await deps.userService.getUserDetailForPermittedAdmin(
        operation,
        principal.principal.subjectId,
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
      c.set("principalSessionId", principal.principalSessionId);
      await next();
      if (c.error !== undefined)
        throw c.error;
    }));
  }
  return { adminAuthenticationHandler };
}
