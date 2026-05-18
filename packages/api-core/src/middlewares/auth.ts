import type { Context, Next } from "hono";
import type { Redis } from "ioredis";
import type { z } from "zod";
import { deleteCookie, getCookie } from "hono/cookie";
import { AuthzForbiddenError } from "../errors/AuthzForbiddenError";
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError";
import { CustomError } from "../errors/CustomError";
import { reviveIsoDates } from "../utils/common";

export type SessionUser = {
  id: number;
  username: string;
  roles: string[];
};

export type SessionAuthOptions<TUser extends SessionUser> = {
  redis: Redis;
  userSchema: z.ZodType<TUser>;
};

export type AdminAuthOptions<TUser extends SessionUser> = SessionAuthOptions<TUser> & {
  allowedClientCodes: string[];
  adminRoleCodes: string[];
};

async function readSessionUser<TUser extends SessionUser>(
  c: Context,
  options: SessionAuthOptions<TUser>,
): Promise<TUser> {
  const clientCode = c.req.header("Client");
  const sessionCookieName = clientCode === "iam" ? "global_session" : `local_${clientCode}_session`;
  const sessionId = getCookie(c, sessionCookieName) ?? c.req.header("Authorization") ?? null;

  if (!clientCode) {
    throw new CustomError("非法请求");
  }
  if (!sessionId) {
    throw new AuthzUnauthorizedError("未登录");
  }
  const redisKey = clientCode === "iam"
    ? `global_session:${sessionId}`
    : `local_${clientCode}_session:${sessionId}`;
  const userString = await options.redis.get(redisKey);
  if (!userString) {
    deleteCookie(c, sessionCookieName);
    deleteCookie(c, "orcas_sso_sessionid");
    throw new AuthzUnauthorizedError("未登录");
  }

  return options.userSchema.parse(JSON.parse(userString, reviveIsoDates));
}

export function createPublicAuthenticationHandler<TUser extends SessionUser>(
  options: SessionAuthOptions<TUser>,
) {
  return async (c: Context, next: Next) => {
    const user = await readSessionUser(c, options);
    c.set("userId", user.id);
    c.set("username", user.username);
    c.set("userDetailDto", user);
    return await next();
  };
}

export function createAdminAuthenticationHandler<TUser extends SessionUser>(
  options: AdminAuthOptions<TUser>,
) {
  return async (c: Context, next: Next) => {
    const clientCode = c.req.header("Client");
    if (!clientCode || !options.allowedClientCodes.includes(clientCode)) {
      throw new AuthzForbiddenError("无管理端访问权限");
    }

    const user = await readSessionUser(c, options);
    const hasAdminRole = user.roles.some(role => options.adminRoleCodes.includes(role));
    if (!hasAdminRole) {
      throw new AuthzForbiddenError("无管理端访问权限");
    }

    c.set("userId", user.id);
    c.set("username", user.username);
    c.set("userDetailDto", user);
    return await next();
  };
}

export function createInternalAuthenticationHandler<TClient>(
  options: { getClientBySecret: (secret: string) => Promise<TClient | null> },
) {
  return async (c: Context, next: Next) => {
    const clientSecret = c.req.header("apikey");
    if (!clientSecret) {
      throw new AuthzUnauthorizedError("非法访问");
    }
    const clientDto = await options.getClientBySecret(clientSecret);
    if (!clientDto) {
      throw new AuthzUnauthorizedError("无效secret");
    }
    return await next();
  };
}
