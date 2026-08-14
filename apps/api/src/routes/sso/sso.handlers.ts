import type { LoggerPort } from "@api/composition/runtime";
import type { SsoPrincipalTokenSource } from "@api/use-cases/sso/authorize-sso/authorize-sso.type";
import type { AuthorizeSsoUseCase } from "@api/use-cases/sso/authorize-sso/authorize-sso.use-case";
import type { CheckSsoLoginContinuationUseCase } from "@api/use-cases/sso/check-login-continuation/check-login-continuation.use-case";
import type { CompleteSsoCallbackUseCase } from "@api/use-cases/sso/complete-sso-callback/complete-sso-callback.use-case";
import type { ExchangeSsoCodeUseCase } from "@api/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case";
import type { LoginWithOaUseCase } from "@api/use-cases/sso/login-with-oa/login-with-oa.use-case";
import type { LoginWithWechatUseCase } from "@api/use-cases/sso/login-with-wechat/login-with-wechat.use-case";
import type { LogoutSsoSessionUseCase } from "@api/use-cases/sso/logout-sso-session/logout-sso-session.use-case";
import type { Context } from "hono";
import type { SsoRouteHandler } from "./sso.type";
import { mapCustomSsoRetryableError } from "@api/middlewares/custom-sso-retryable.error";
import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import {
  customSsoLocalSessionCookieName,
  decodeCustomSsoClientCode,
} from "@api/services/sso/custom-sso-client-code.transport";
import { expireCustomSsoCookies } from "@api/services/sso/custom-sso-cookie";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { BadRequestError } from "@iam/api-core/errors/BadRequestError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import * as resp from "@iam/api-core/http";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/subject-access";
import { getProtocolAndHost } from "@iam/api-core/utils";
import {
  ApiErrorCode,
  ClientCodeSchema,
  CustomSsoClientMode,
} from "@iam/contracts";
import { getCookie, setCookie } from "hono/cookie";
import { SsoTokenResultSchema } from "./sso.schema";

type SsoEntryNetwork = "internal" | "external";
const subjectAccessHttp = createSubjectAccessHttpAdapter();

export interface CreateSsoHandlersDeps {
  logger: Pick<LoggerPort, "warn">;
  sso: {
    authorize: AuthorizeSsoUseCase;
    checkLoginContinuation: CheckSsoLoginContinuationUseCase;
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
    projectionRetryAfterSeconds: number;
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
    const localSessionCookieName
      = customSsoLocalSessionCookieName(client);
    const requestContext = getApiAuditRequestContext(c);
    const data = await runCustomSsoHttpBoundary(
      c,
      {
        clearCookiesOnInvalidSession: [
          "global_session",
          localSessionCookieName,
          "orcas_sso_sessionid",
        ],
        retryAfterSeconds:
          deps.config.projectionRetryAfterSeconds,
      },
      async () => await deps.sso.completeCallback.execute({
        code,
        clientCode: client,
        redirectUrl,
      }, { requestContext }),
    );
    setCookie(c, localSessionCookieName, data.token, {
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
    if (data.state !== undefined)
      urlObject.searchParams.set("state", data.state);
    return c.redirect(urlObject.toString());
  };

  const token: SsoRouteHandler<"token"> = async (c) => {
    if (new URL(c.req.url).search !== "")
      throw new BadRequestError("token endpoint 不接受 query 参数");
    const { clientCode, clientSecret } = parseBasicClientCredentials(
      c.req.header("Authorization"),
    );
    const { code, redirect_uri: redirectUri } = c.req.valid("form");
    const data = await runCustomSsoHttpBoundary(
      c,
      {
        clearCookiesOnInvalidSession: [],
        retryAfterSeconds:
          deps.config.projectionRetryAfterSeconds,
      },
      async () =>
        await deps.sso.exchangeCode.execute({
          code,
          clientCode,
          clientSecret,
          redirectUri,
        }, { requestContext: getApiAuditRequestContext(c) }),
    );
    return c.json(
      resp.ok(SsoTokenResultSchema.parse(data)),
      HttpStatusCodes.OK,
    );
  };

  const authorize: SsoRouteHandler<"authorize"> = async (c) => {
    const { client, redirectUrl, state, token } = c.req.valid("query");
    const searchParams = new URLSearchParams(c.req.query());
    const requestContext = getApiAuditRequestContext(c);
    const globalSessionCookie = getCookie(c, "global_session");
    const principalToken = resolvePrincipalToken(globalSessionCookie, c.req.header("Authorization"), token);
    const data = await runCustomSsoHttpBoundary(
      c,
      {
        clearCookiesOnInvalidSession:
          globalSessionCookie === undefined
            ? []
            : ["global_session"],
        retryAfterSeconds:
          deps.config.projectionRetryAfterSeconds,
      },
      async () => await deps.sso.authorize.execute({
        clientCode: client,
        globalSessionToken: principalToken.token,
        redirectUrl,
        ...(state === undefined ? {} : { state }),
        tokenSource: principalToken.source,
      }, { requestContext }),
    );
    if (data.isLogin === false) {
      return c.redirect(`${deps.config.loginEndpoint}?${searchParams.toString()}`);
    }
    const callbackPath = data.mode === CustomSsoClientMode.Gateway
      ? `${getProtocolAndHost(data.redirectUrl)}/sso/callback`
      : data.callbackEndpoint;
    if (callbackPath === undefined)
      throw new InvalidSsoClientError("非法Client");
    const callbackUrl = new URL(callbackPath);
    callbackUrl.searchParams.set("code", data.code);
    callbackUrl.searchParams.set("client", data.clientCode);
    callbackUrl.searchParams.set("redirectUrl", data.redirectUrl);
    if (
      data.mode === CustomSsoClientMode.Independent
      && data.state !== undefined
    ) {
      callbackUrl.searchParams.set("state", data.state);
    }
    return c.redirect(callbackUrl.toString());
  };

  const loginGuard: SsoRouteHandler<"loginGuard"> = async (c) => {
    const { client, redirectUrl } = c.req.valid("query");
    const globalSessionToken = getCookie(c, "global_session");
    const data = await runCustomSsoHttpBoundary(
      c,
      {
        clearCookiesOnInvalidSession: [],
        retryAfterSeconds: deps.config.projectionRetryAfterSeconds,
      },
      async () => await deps.sso.checkLoginContinuation.execute({
        clientCode: client,
        globalSessionToken,
        redirectUrl,
      }),
    );
    if (data.clearGlobalSessionCookie)
      expireCustomSsoCookies(c, ["global_session"]);
    return c.json(
      resp.ok({ decision: data.decision }),
      HttpStatusCodes.OK,
    );
  };

  const logout: SsoRouteHandler<"logout"> = async (c) => {
    const { redirectUrl, token } = c.req.valid("query");
    const globalSessionCookie = getCookie(c, "global_session");
    const sessionToken = globalSessionCookie ?? token;
    await runCustomSsoHttpBoundary(c, {
      clearCookiesOnInvalidSession: globalSessionCookie === undefined
        ? []
        : ["global_session"],
      retryAfterSeconds: deps.config.projectionRetryAfterSeconds,
    }, async () => await deps.sso.logout.execute({ sessionToken }));
    expireCustomSsoCookies(c, ["global_session"]);
    return c.redirect(redirectUrl ?? deps.config.loginEndpoint);
  };

  const loginOA: SsoRouteHandler<"loginOA"> = async (c) => {
    const { clientCode } = c.req.valid("param");
    const { loginid, ts, token, redirectUrl, client, state } = c.req.valid("query");
    const globalSessionCookie = getCookie(c, "global_session");
    const sessionId = globalSessionCookie ?? c.req.header("Authorization");
    if (sessionId) {
      await subjectAccessHttp.run(c, {
        clearCookiesOnInvalidSession: globalSessionCookie === undefined
          ? []
          : ["global_session"],
      }, async () => await deps.sso.logout.execute({ sessionToken: sessionId }));
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
    return c.redirect(buildAuthorizeResumeUrl({
      client,
      redirectUrl,
      state,
      token: data.token,
    }));
  };

  const loginWX: SsoRouteHandler<"loginWX"> = async (c) => {
    const { code, redirectUrl, client, state } = c.req.valid("query");
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
    return c.redirect(buildAuthorizeResumeUrl({
      client,
      redirectUrl,
      state,
      token: data.token,
    }));
  };

  return {
    authorize,
    callback,
    endpointsConfiguration,
    loginOA,
    loginGuard,
    loginWX,
    logout,
    token,
  };
}

async function runCustomSsoHttpBoundary<T>(
  context: Context,
  options: {
    readonly clearCookiesOnInvalidSession: readonly string[];
    readonly retryAfterSeconds: number;
  },
  operation: () => Promise<T>,
) {
  try {
    return await subjectAccessHttp.run(
      context,
      options,
      operation,
    );
  }
  catch (error) {
    throw mapCustomSsoRetryableError(error, {
      retryAfterSeconds: options.retryAfterSeconds,
    });
  }
}

function buildAuthorizeResumeUrl(input: {
  client: string;
  redirectUrl: string;
  state?: string;
  token: string;
}) {
  const searchParams = new URLSearchParams({
    client: input.client,
    redirectUrl: input.redirectUrl,
    token: input.token,
  });
  if (input.state !== undefined)
    searchParams.set("state", input.state);
  return `/sso/authorize?${searchParams.toString()}`;
}

export type SsoHandlers = ReturnType<typeof createSsoHandlers>;

function parseBasicClientCredentials(authorization: string | undefined) {
  if (authorization === undefined)
    throw new InvalidSsoClientError("非法Client");
  const match = /^Basic ([A-Z0-9+/]+={0,2})$/iu.exec(authorization);
  const encoded = match?.[1];
  if (encoded === undefined || encoded.length % 4 !== 0)
    throw new InvalidSsoClientError("非法Client");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded)
    throw new InvalidSsoClientError("非法Client");

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  catch {
    throw new InvalidSsoClientError("非法Client");
  }
  const separator = decoded.indexOf(":");
  if (separator <= 0 || separator === decoded.length - 1)
    throw new InvalidSsoClientError("非法Client");
  const clientCodeResult = ClientCodeSchema.safeParse(
    decodeCustomSsoClientCode(decoded.slice(0, separator)),
  );
  if (!clientCodeResult.success)
    throw new InvalidSsoClientError("非法Client");
  return {
    clientCode: clientCodeResult.data,
    clientSecret: decoded.slice(separator + 1),
  };
}
