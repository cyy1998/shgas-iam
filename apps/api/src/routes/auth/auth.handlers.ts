import type { LoggerPort } from "@api/composition/runtime";
import type { LoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import type { ClientService } from "@api/services/client/client.service";
import type { LoginWithMobileUseCase } from "@api/use-cases/authentication/login-with-mobile/login-with-mobile.use-case";
import type { LoginWithPasswordUseCase } from "@api/use-cases/authentication/login-with-password/login-with-password.use-case";
import type { AuthRouteHandler } from "./auth.type";
import {
  mapCustomSsoRetryableError,
} from "@api/middlewares/custom-sso-retryable.error";
import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import {
  customSsoLocalSessionCookieName,
  decodeCustomSsoClientCode,
} from "@api/services/sso/transport/custom-sso-client-code.transport";
import { expireCustomSsoCookies } from "@api/services/sso/transport/custom-sso-cookie";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";
import { SystemLogEvent } from "@iam/api-core/logger";
import { verifyInternalClient } from "@iam/api-core/middlewares";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/subject-access";
import { ClientCodeSchema } from "@iam/contracts";
import { CustomSsoRequestMismatchError } from "@iam/custom-sso";
import { getCookie, setCookie } from "hono/cookie";

const subjectAccessHttp = createSubjectAccessHttpAdapter();

export interface CreateAuthHandlersDeps {
  authentication: {
    loginWithMobile: Pick<LoginWithMobileUseCase, "execute">;
    loginWithPassword: Pick<LoginWithPasswordUseCase, "execute">;
  };
  clientService: Pick<ClientService, "getClientBySecret">;
  localSessionAuthorizer: {
    authorizeLocalSession: (
      sessionId: string,
      clientCode: string,
    ) => Promise<string>;
  };
  loginCredentialParser: Pick<LoginCredentialParser, "parseLoginPasswordCredential">;
  logger: Pick<LoggerPort, "info">;
  config: {
    projectionRetryAfterSeconds: number;
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
    const encodedClientCode = c.req.header("Client");
    const clientCodeResult = ClientCodeSchema.safeParse(
      encodedClientCode === undefined
        ? null
        : decodeCustomSsoClientCode(encodedClientCode),
    );
    if (
      !c.req.header("X-Forwarded-Uri")
      || !clientCodeResult.success
    ) {
      throw new AuthzUnauthorizedError("非法访问");
    }
    const clientCode = clientCodeResult.data;
    const localSessionCookieName
      = customSsoLocalSessionCookieName(clientCode);
    const localSessionCookie = getCookie(c, localSessionCookieName);
    const sessionId = localSessionCookie ?? c.req.header("Authorization");
    if (!sessionId) {
      throw new AuthzUnauthorizedError("未登录");
    }
    let data;
    try {
      data = await subjectAccessHttp.run(c, {
        clearCookiesOnInvalidSession: localSessionCookie === undefined
          ? []
          : [localSessionCookieName, "orcas_sso_sessionid"],
      }, async () => {
        try {
          return await deps.localSessionAuthorizer.authorizeLocalSession(
            sessionId,
            clientCode,
          );
        }
        catch (error) {
          throw mapCustomSsoRetryableError(error, {
            retryAfterSeconds: deps.config.projectionRetryAfterSeconds,
          });
        }
      });
    }
    catch (error) {
      if (
        error instanceof AuthzUnauthorizedError
        && !(error instanceof CustomSsoRequestMismatchError)
        && localSessionCookie !== undefined
      ) {
        expireCustomSsoCookies(c, [
          localSessionCookieName,
          "orcas_sso_sessionid",
        ]);
      }
      throw error;
    }
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
