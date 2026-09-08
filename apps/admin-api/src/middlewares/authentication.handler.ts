import type { UserService } from "@admin-api/services/user/user.service";
import type { SessionKernel } from "@iam/session-kernel";
import type { Context, Next } from "hono";
import { AuthzForbiddenError } from "@iam/api-core/errors/AuthzForbiddenError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import {
  createSubjectAccessHttpAdapter,
  translateSubjectAccessResolveResult,
} from "@iam/api-core/subject-access";
import { UserStatus } from "@iam/contracts";
import { getCookie, setCookie } from "hono/cookie";

const GLOBAL_SESSION_COOKIE = "global_session";
const ORCAS_SESSION_COOKIE = "orcas_sso_sessionid";
const subjectAccessHttp = createSubjectAccessHttpAdapter();

export interface CreateAdminAuthenticationHandlersDeps {
  sessionKernel: Pick<SessionKernel, "resolvePrincipalSession">;
  userService: Pick<UserService, "getUserDetailBySubjectIdentifierForAdmin">;
  config: {
    allowedClientCodes: string[];
  };
}

export function createAdminAuthenticationHandlers(deps: CreateAdminAuthenticationHandlersDeps) {
  async function adminAuthenticationHandler(c: Context, next: Next) {
    const clientCode = c.req.header("Client");
    if (!clientCode || !deps.config.allowedClientCodes.includes(clientCode)) {
      throw new AuthzForbiddenError("无管理端访问权限");
    }

    const sessionCookie = getCookie(c, GLOBAL_SESSION_COOKIE);
    const token = sessionCookie ?? c.req.header("Authorization") ?? null;
    if (!token) {
      clearGlobalSessionCookies(c);
      throw new AuthzUnauthorizedError("未登录");
    }

    const principal = await subjectAccessHttp.run(c, {
      clearCookiesOnInvalidSession: sessionCookie === undefined
        ? []
        : [GLOBAL_SESSION_COOKIE, ORCAS_SESSION_COOKIE],
    }, async () => {
      return translateSubjectAccessResolveResult(
        await deps.sessionKernel.resolvePrincipalSession(token),
      );
    });
    if (principal.status !== "resolved") {
      if (sessionCookie !== undefined)
        clearGlobalSessionCookies(c);
      throw new AuthzUnauthorizedError("未登录");
    }

    if (principal.value.principal.principalType !== "user") {
      clearGlobalSessionCookies(c);
      throw new AuthzUnauthorizedError("未登录");
    }

    const user = await deps.userService
      .getUserDetailBySubjectIdentifierForAdmin(principal.value.principal.subjectId)
      .catch(() => null);
    if (!user || user.status !== UserStatus.Enable) {
      clearGlobalSessionCookies(c);
      throw new AuthzUnauthorizedError("未登录");
    }

    c.set("userId", user.id);
    c.set("username", user.username);
    c.set("userDetailDto", user);
    c.set("principalSessionId", principal.value.principalSessionId);
    return await next();
  }

  return {
    adminAuthenticationHandler,
  };
}

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
