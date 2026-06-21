import type { RedisPort } from "@api/composition/runtime";
import type { ClientService } from "@api/services/client/client.service";
import type { CustomSsoSessionKernelAdapter } from "@api/services/session/custom-sso-session-kernel.adapter";
import type { Context, Next } from "hono";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { CustomError } from "@iam/api-core/errors/CustomError";
import {
  createInternalAuthenticationHandler,
} from "@iam/api-core/middlewares";
import { deleteCookie, getCookie } from "hono/cookie";

export interface CreateApiAuthenticationHandlersDeps {
  clientService: Pick<ClientService, "getClientByCode" | "getClientBySecret">;
  customSsoSession: Pick<CustomSsoSessionKernelAdapter, "resolveLocalSessionUser" | "resolvePrincipalSessionUser">;
  redis: RedisPort;
}

export function createApiAuthenticationHandlers(deps: CreateApiAuthenticationHandlersDeps) {
  async function publicAuthenticationHandler(c: Context, next: Next) {
    const clientCode = c.req.header("Client");
    if (!clientCode) {
      throw new CustomError("非法请求");
    }

    const sessionCookieName = clientCode === "iam" ? "global_session" : `local_${clientCode}_session`;
    const sessionToken = getCookie(c, sessionCookieName) ?? c.req.header("Authorization") ?? null;
    if (!sessionToken) {
      throw new AuthzUnauthorizedError("未登录");
    }

    try {
      const user = clientCode === "iam"
        ? await deps.customSsoSession.resolvePrincipalSessionUser(sessionToken)
        : await resolveCustomSsoLocalSessionUser(clientCode, sessionToken);
      c.set("userId", user.id);
      c.set("username", user.username);
      c.set("userDetailDto", user);
      return await next();
    }
    catch (error) {
      deleteCookie(c, sessionCookieName);
      deleteCookie(c, "orcas_sso_sessionid");
      if (error instanceof AuthzUnauthorizedError) {
        throw error;
      }
      throw error;
    }
  }

  async function resolveCustomSsoLocalSessionUser(clientCode: string, sessionToken: string) {
    const client = await deps.clientService.getClientByCode(clientCode);
    if (!client) {
      throw new AuthzUnauthorizedError("未登录");
    }
    return await deps.customSsoSession.resolveLocalSessionUser(sessionToken, client);
  }

  return {
    publicAuthenticationHandler,
    internalAuthenticationHandler: createInternalAuthenticationHandler({
      getClientBySecret: deps.clientService.getClientBySecret,
    }),
  };
}

export type ApiAuthenticationHandlers = ReturnType<typeof createApiAuthenticationHandlers>;
