import type { LoggerPort } from "@api/composition/runtime";
import type { ClientService } from "@api/services/client/client.service";
import type { SsoPrincipalTokenSource } from "@api/use-cases/sso/authorize-sso/authorize-sso.type";
import type { AuthorizeSsoUseCase } from "@api/use-cases/sso/authorize-sso/authorize-sso.use-case";
import type { CompleteSsoCallbackUseCase } from "@api/use-cases/sso/complete-sso-callback/complete-sso-callback.use-case";
import type { ExchangeSsoCodeUseCase } from "@api/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case";
import type { LoginWithOaUseCase } from "@api/use-cases/sso/login-with-oa/login-with-oa.use-case";
import type { LoginWithWechatUseCase } from "@api/use-cases/sso/login-with-wechat/login-with-wechat.use-case";
import type { LogoutSsoSessionUseCase } from "@api/use-cases/sso/logout-sso-session/logout-sso-session.use-case";
import type { SsoRouteHandler } from "./sso.type";
import { getApiAuditRequestContext } from "@api/services/audit/audit.service";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { getProtocolAndHost } from "@iam/api-core/utils";
import { ApiErrorCode, ClientManagementLevel } from "@iam/contracts";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

type SsoEntryNetwork = "internal" | "external";

export interface CreateSsoHandlersDeps {
  clientService: Pick<ClientService, "getClientByCode">;
  logger: Pick<LoggerPort, "warn">;
  sso: {
    authorize: AuthorizeSsoUseCase;
    completeCallback: CompleteSsoCallbackUseCase;
    exchangeCode: ExchangeSsoCodeUseCase;
    loginWithOa: LoginWithOaUseCase;
    loginWithWechat: LoginWithWechatUseCase;
    logout: LogoutSsoSessionUseCase;
  };
  config: {
    authorizationEndpoint: string;
    authCodeExpireSeconds: number;
    loginEndpoint: string;
    logoutEndpoint: string;
    redisExpireSeconds: number;
    ssoExternalOrigin: string;
    ssoInternalOrigin: string;
    thirdPartyOAEndpoint: string;
  };
}

function joinOriginPath(origin: string, path: string) {
  return `${origin.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function resolveSsoOrigin(deps: CreateSsoHandlersDeps, entryNetwork: string | undefined) {
  if (entryNetwork === "internal") {
    return deps.config.ssoInternalOrigin;
  }
  if (entryNetwork === "external") {
    return deps.config.ssoExternalOrigin;
  }
  return null;
}

function resolvePrincipalToken(
  cookieToken: string | undefined,
  authorizationHeader: string | undefined,
  queryToken: string | undefined,
): { token?: string; source: SsoPrincipalTokenSource } {
  if (cookieToken) {
    return { token: cookieToken, source: "cookie" };
  }
  if (authorizationHeader) {
    return { token: authorizationHeader, source: "authorization_header" };
  }
  if (queryToken) {
    return { token: queryToken, source: "query" };
  }
  return { source: "none" };
}

export function createSsoHandlers(deps: CreateSsoHandlersDeps) {
  const endpointsConfiguration: SsoRouteHandler<"endpointsConfiguration"> = async (c) => {
    const entryNetwork = c.req.header("X-IAM-Entry-Network") as SsoEntryNetwork | undefined;
    const origin = resolveSsoOrigin(deps, entryNetwork);
    if (origin === null) {
      deps.logger.warn({ entryNetwork }, "invalid sso entry network header");
      return c.json(
        resp.fail(ApiErrorCode.BadRequest, "非法 SSO 入口"),
        HttpStatusCodes.BAD_REQUEST,
      );
    }

    return c.json(resp.ok({
      authorizationEndpoint: joinOriginPath(origin, deps.config.authorizationEndpoint),
      logoutEndpoint: joinOriginPath(origin, deps.config.logoutEndpoint),
      thirdPartyOAEndpoint: joinOriginPath(origin, deps.config.thirdPartyOAEndpoint),
    }), HttpStatusCodes.OK);
  };

  const callback: SsoRouteHandler<"callback"> = async (c) => {
    const { code, client, redirectUrl } = c.req.valid("query");
    const requestContext = getApiAuditRequestContext(c);
    const data = await deps.sso.completeCallback.execute({
      code,
      clientCode: client,
      redirectUrl,
    }, { requestContext });
    setCookie(c, `local_${client}_session`, data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: deps.config.redisExpireSeconds,
      path: "/",
    });
    const urlObject = new URL(redirectUrl);
    urlObject.searchParams.set("token", data.token);
    if (data.orcasSessionId != null) {
      setCookie(c, `orcas_sso_sessionid`, data.orcasSessionId, {
        httpOnly: true,
        sameSite: "Lax",
        maxAge: deps.config.redisExpireSeconds,
        path: "/",
      });
      urlObject.searchParams.set("orcasToken", data.orcasSessionId);
    }
    return c.redirect(urlObject.toString());
  };

  const token: SsoRouteHandler<"token"> = async (c) => {
    const { code, client, clientSecret } = c.req.valid("query");
    const data = await deps.sso.exchangeCode.execute({
      code,
      clientCode: client,
      clientSecret,
    }, { requestContext: getApiAuditRequestContext(c) });
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  const authorize: SsoRouteHandler<"authorize"> = async (c) => {
    const { client, redirectUrl, token } = c.req.valid("query");
    const searchParams = new URLSearchParams(c.req.query());
    const requestContext = getApiAuditRequestContext(c);
    const principalToken = resolvePrincipalToken(getCookie(c, "global_session"), c.req.header("Authorization"), token);
    const clientDto = await deps.clientService.getClientByCode(client);
    const data = await deps.sso.authorize.execute({
      clientCode: client,
      globalSessionToken: principalToken.token,
      redirectUrl,
      tokenSource: principalToken.source,
    }, { requestContext });
    if (data.isLogin === false) {
      return c.redirect(`${deps.config.loginEndpoint}?${searchParams.toString()}`);
    }
    const callbackPath = clientDto?.extAttributes.managementLevel === ClientManagementLevel.Gateway
      ? `${getProtocolAndHost(redirectUrl)}/sso/callback`
      : `${clientDto?.extAttributes.callbackEndpoint}`;
    return c.redirect(`${callbackPath}?code=${data.code}&client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`);
  };

  const logout: SsoRouteHandler<"logout"> = async (c) => {
    const { redirectUrl, token } = c.req.valid("query");
    const sessionToken = getCookie(c, "global_session") ?? token;
    await deps.sso.logout.execute({ sessionToken });
    deleteCookie(c, "global_session");
    return c.redirect(redirectUrl ?? deps.config.loginEndpoint);
  };

  const loginOA: SsoRouteHandler<"loginOA"> = async (c) => {
    const { clientCode } = c.req.valid("param");
    const { loginid, ts, token, redirectUrl, client } = c.req.valid("query");
    const sessionId = getCookie(c, "global_session") ?? c.req.header("Authorization");
    if (sessionId) {
      await deps.sso.logout.execute({ sessionToken: sessionId });
    }
    const data = await deps.sso.loginWithOa.execute({
      clientCode,
      loginId: loginid,
      timestamp: ts,
      token,
    }, { requestContext: getApiAuditRequestContext(c) });
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: deps.config.redisExpireSeconds,
      path: "/",
    });
    return c.redirect(`/sso/authorize?client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}&token=${data.token}`);
  };

  const loginWX: SsoRouteHandler<"loginWX"> = async (c) => {
    const { code, redirectUrl, client } = c.req.valid("query");
    const data = await deps.sso.loginWithWechat.execute(
      { code },
      { requestContext: getApiAuditRequestContext(c) },
    );
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: deps.config.redisExpireSeconds,
      path: "/",
    });
    return c.redirect(`/sso/authorize?client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}&token=${data.token}`);
  };

  return {
    authorize,
    callback,
    endpointsConfiguration,
    loginOA,
    loginWX,
    logout,
    token,
  };
}

export type SsoHandlers = ReturnType<typeof createSsoHandlers>;
