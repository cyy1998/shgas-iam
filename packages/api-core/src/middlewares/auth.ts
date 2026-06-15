import type { Context, Next } from "hono";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { z } from "zod";
import type { InternalBindings } from "../types/lib";
import { ClientStatus } from "@iam/contracts";
import { deleteCookie, getCookie } from "hono/cookie";
import { AuthzForbiddenError } from "../errors/AuthzForbiddenError";
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError";
import { CustomError } from "../errors/CustomError";
import { readGlobalSession, readValidatedLocalSessionUser } from "../session";

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

export type InternalClientIdentity = {
  clientCode: string;
  isDelete: boolean;
  status: ClientStatus;
};

export type InternalAuthOptions<TClient extends InternalClientIdentity> = {
  getClientBySecret: (secret: string) => Promise<TClient | null>;
};

type InternalAuthLogger = Pick<Logger, "warn">;

function getContextValue<T>(c: Context, key: string): T | undefined {
  try {
    return c.get(key as never) as T | undefined;
  }
  catch {
    return undefined;
  }
}

function getInternalAuthLogger(c: Context): InternalAuthLogger | undefined {
  const logger = getContextValue<InternalAuthLogger>(c, "logger");
  return typeof logger?.warn === "function" ? logger : undefined;
}

function warnInternalAuthFailure(
  c: Context,
  reason: string,
  metadata: { clientCode?: string; isDelete?: boolean; status?: ClientStatus } = {},
) {
  getInternalAuthLogger(c)?.warn({
    reason,
    requestId: getContextValue<string>(c, "requestId"),
    ...metadata,
  }, "internal client authentication failed");
}

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
  const user = clientCode === "iam"
    ? (await readGlobalSession(options.redis, sessionId, options.userSchema))?.user ?? null
    : await readValidatedLocalSessionUser(options.redis, clientCode, sessionId, options.userSchema);
  if (user !== null)
    return user;

  deleteCookie(c, sessionCookieName);
  deleteCookie(c, "orcas_sso_sessionid");
  throw new AuthzUnauthorizedError("未登录");
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

export async function verifyInternalClient<TClient extends InternalClientIdentity>(
  c: Context,
  options: InternalAuthOptions<TClient>,
): Promise<TClient> {
  const clientSecret = c.req.header("apikey");
  if (!clientSecret) {
    warnInternalAuthFailure(c, "missing_apikey");
    throw new AuthzUnauthorizedError("非法访问");
  }

  const clientDto = await options.getClientBySecret(clientSecret);
  if (!clientDto) {
    warnInternalAuthFailure(c, "secret_not_found");
    throw new AuthzUnauthorizedError("无效secret");
  }

  if (clientDto.isDelete || clientDto.status !== ClientStatus.Enable) {
    warnInternalAuthFailure(c, "inactive_client", {
      clientCode: clientDto.clientCode,
      isDelete: clientDto.isDelete,
      status: clientDto.status,
    });
    throw new AuthzUnauthorizedError("无效secret");
  }

  return clientDto;
}

export function createInternalAuthenticationHandler<TClient extends InternalClientIdentity>(
  options: InternalAuthOptions<TClient>,
) {
  return async (c: Context<InternalBindings<TClient>>, next: Next) => {
    const clientDto = await verifyInternalClient(c, options);
    c.set("clientCode", clientDto.clientCode);
    c.set("clientDto", clientDto);
    return await next();
  };
}
