import type { LoggerPort } from "@api/composition/runtime";
import type { ClientService } from "@api/services/client/client.service";
import type { AuthService } from "./auth.service";
import type { AuthRouteHandler } from "./auth.type";
import type { LoginCredentialParser } from "./login-credential.helper";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";
import { SystemLogEvent } from "@iam/api-core/logger";
import { verifyInternalClient } from "@iam/api-core/middlewares";
import { getCookie, setCookie } from "hono/cookie";
import { getVerificationContext } from "../human-verification-context";

export interface CreateAuthHandlersDeps {
  authService: Pick<AuthService, "loginPassword" | "loginMobile" | "authz">;
  clientService: Pick<ClientService, "getClientByCode" | "getClientBySecret">;
  loginCredentialParser: Pick<LoginCredentialParser, "parseLoginPasswordCredential">;
  logger: Pick<LoggerPort, "info">;
  config: {
    redisExpireSeconds: number;
  };
}

export function createAuthHandlers(deps: CreateAuthHandlersDeps) {
  const loginPassword: AuthRouteHandler<"loginPassword"> = async (c) => {
    const { credential, capToken } = c.req.valid("json");
    const { username, password } = await deps.loginCredentialParser.parseLoginPasswordCredential(credential);
    const data = await deps.authService.loginPassword(username, password, {
      capToken,
      context: getVerificationContext(c, username),
    });
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: deps.config.redisExpireSeconds,
      path: "/",
    });
    return c.json(resp.ok(data));
  };

  const loginMobile: AuthRouteHandler<"loginMobile"> = async (c) => {
    const { code, phoneNumber, capToken } = c.req.valid("json");
    const data = await deps.authService.loginMobile(phoneNumber, code, {
      capToken,
      context: getVerificationContext(c, phoneNumber),
    });
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: deps.config.redisExpireSeconds,
      path: "/",
    });
    return c.json(resp.ok(data));
  };

  const authz: AuthRouteHandler<"authz"> = async (c) => {
    const clientCode = c.req.header("Client");
    const sessionId = getCookie(c, `local_${clientCode}_session`) ?? c.req.header("Authorization");
    if (!c.req.header("X-Forwarded-Uri") || !clientCode) {
      throw new AuthzUnauthorizedError("非法访问");
    }
    const client = await deps.clientService.getClientByCode(clientCode);
    if (!client) {
      throw new AuthzUnauthorizedError("非法访问");
    }
    if (!sessionId) {
      throw new AuthzUnauthorizedError("未登录");
    }
    const data = await deps.authService.authz(sessionId, client);
    c.header("X-User-Info", data);
    return c.json(resp.ok(data));
  };

  const internalAuthz: AuthRouteHandler<"internalAuthz"> = async (c) => {
    const clientSecret = c.req.header("apikey");
    const sourceIp = c.req.header("IP-Chain");
    deps.logger.info({
      event: SystemLogEvent.InternalAuthzChecked,
      requestId: c.get("requestId"),
      sourceIp,
      hasClientSecret: clientSecret !== undefined,
    }, "internal authorization checked");
    await verifyInternalClient(c, {
      getClientBySecret: deps.clientService.getClientBySecret,
    });
    return c.json(resp.ok(true));
  };

  return {
    authz,
    internalAuthz,
    loginMobile,
    loginPassword,
  };
}

export type AuthHandlers = ReturnType<typeof createAuthHandlers>;
