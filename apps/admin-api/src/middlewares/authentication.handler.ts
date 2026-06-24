import type { RedisPort } from "@admin-api/composition/runtime";
import type { UserService } from "@admin-api/services/user/user.service";
import type { SessionKernel } from "@iam/api-core/session/kernel";
import type { Context, Next } from "hono";
import { UserDetailDtoSchema } from "@admin-api/services/user/user.schema";
import { AuthzForbiddenError } from "@iam/api-core/errors/AuthzForbiddenError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { createAdminAuthenticationHandler } from "@iam/api-core/middlewares";
import { UserStatus } from "@iam/contracts";
import { deleteCookie, getCookie } from "hono/cookie";

const GLOBAL_SESSION_COOKIE = "global_session";
const ORCAS_SESSION_COOKIE = "orcas_sso_sessionid";

export interface CreateAdminAuthenticationHandlersDeps {
  redis: RedisPort;
  sessionKernel: Pick<SessionKernel, "resolvePrincipalSession">;
  userService: Pick<UserService, "getUserDetailByUsernameForAdmin">;
  config: {
    allowedClientCodes: string[];
    adminRoleCodes: string[];
  };
}

export function createAdminAuthenticationHandlers(deps: CreateAdminAuthenticationHandlersDeps) {
  const legacyAdminAuthenticationHandler = createAdminAuthenticationHandler({
    redis: deps.redis,
    userSchema: UserDetailDtoSchema,
    allowedClientCodes: deps.config.allowedClientCodes,
    adminRoleCodes: deps.config.adminRoleCodes,
  });

  async function adminAuthenticationHandler(c: Context, next: Next) {
    const clientCode = c.req.header("Client");
    if (!clientCode || !deps.config.allowedClientCodes.includes(clientCode)) {
      throw new AuthzForbiddenError("无管理端访问权限");
    }

    const token = getCookie(c, GLOBAL_SESSION_COOKIE) ?? c.req.header("Authorization") ?? null;
    if (!token) {
      return await legacyAdminAuthenticationHandler(c, next);
    }

    const principal = await deps.sessionKernel.resolvePrincipalSession(token);
    if (principal.status !== "resolved") {
      if (isKernelPrincipalToken(token)) {
        clearGlobalSessionCookies(c);
        throw new AuthzUnauthorizedError("未登录");
      }
      return await legacyAdminAuthenticationHandler(c, next);
    }

    if (principal.value.principal.principalType !== "user" || !principal.value.snapshot.username) {
      clearGlobalSessionCookies(c);
      throw new AuthzUnauthorizedError("未登录");
    }

    const user = await deps.userService.getUserDetailByUsernameForAdmin(principal.value.snapshot.username)
      .catch(() => null);
    if (!user || user.status !== UserStatus.Enable || String(user.id) !== principal.value.principal.subjectId) {
      clearGlobalSessionCookies(c);
      throw new AuthzUnauthorizedError("未登录");
    }

    const hasAdminRole = user.roles.some(role => deps.config.adminRoleCodes.includes(role));
    if (!hasAdminRole) {
      throw new AuthzForbiddenError("无管理端访问权限");
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
  deleteCookie(c, GLOBAL_SESSION_COOKIE);
  deleteCookie(c, ORCAS_SESSION_COOKIE);
}

function isKernelPrincipalToken(token: string) {
  return token.startsWith("iam_ps_");
}

export type AdminAuthenticationHandlers = ReturnType<typeof createAdminAuthenticationHandlers>;
