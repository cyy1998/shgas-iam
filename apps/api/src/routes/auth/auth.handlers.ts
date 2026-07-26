import type { LoggerPort } from "@api/composition/runtime";
import type { LoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import type { ClientService } from "@api/services/client/client.service";
import type { ClientDto } from "@api/services/client/client.type";
import type { LoginWithMobileUseCase } from "@api/use-cases/authentication/login-with-mobile/login-with-mobile.use-case";
import type { LoginWithPasswordUseCase } from "@api/use-cases/authentication/login-with-password/login-with-password.use-case";
import type { AuthRouteHandler } from "./auth.type";
import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";
import { SystemLogEvent } from "@iam/api-core/logger";
import { verifyInternalClient } from "@iam/api-core/middlewares";
import { getCookie, setCookie } from "hono/cookie";

export interface CreateAuthHandlersDeps {
  authentication: {
    loginWithMobile: Pick<LoginWithMobileUseCase, "execute">;
    loginWithPassword: Pick<LoginWithPasswordUseCase, "execute">;
  };
  clientService: Pick<ClientService, "getClientByCode" | "getClientBySecret">;
  localSessionAuthorizer: {
    authorizeLocalSession: (sessionId: string, client: ClientDto) => Promise<string>;
  };
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
    const requestContext = getApiAuditRequestContext(c);
    const data = await deps.authentication.loginWithPassword.execute(
      { capToken, password, username },
      { requestContext },
    );
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: deps.config.redisExpireSeconds,
      path: "/",
    });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const loginMobile: AuthRouteHandler<"loginMobile"> = async (c) => {
    const { code, phoneNumber, capToken } = c.req.valid("json");
    const requestContext = getApiAuditRequestContext(c);
    const data = await deps.authentication.loginWithMobile.execute(
      { capToken, code, phoneNumber },
      { requestContext },
    );
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: deps.config.redisExpireSeconds,
      path: "/",
    });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
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
    const data = await deps.localSessionAuthorizer.authorizeLocalSession(sessionId, client);
    c.header("X-User-Info", data);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
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
    return c.json(resp.ok(true), HttpStatusCodes.OK);
  };

  return {
    authz,
    internalAuthz,
    loginMobile,
    loginPassword,
  };
}

export type AuthHandlers = ReturnType<typeof createAuthHandlers>;
