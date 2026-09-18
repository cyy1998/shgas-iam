import type { LoggerPort } from "@api/composition/runtime";
import type { LoginWithOaUseCase } from "@api/use-cases/authentication/login-with-oa/login-with-oa.use-case";
import type { LoginWithWechatUseCase } from "@api/use-cases/authentication/login-with-wechat/login-with-wechat.use-case";
import type { Context } from "hono";
import type { SsoRouteHandler } from "./sso.type";
import { mapCustomSsoRetryableError } from "@api/middlewares/custom-sso-retryable.error";
import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import { decodeCustomSsoClientCode } from "@api/services/sso/transport/custom-sso-client-code.transport";
import { expireCustomSsoCookies } from "@api/services/sso/transport/custom-sso-cookie";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import * as resp from "@iam/api-core/http";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/subject-access";
import { ApiErrorCode, ClientCodeSchema } from "@iam/contracts";
import { getCookie, setCookie } from "hono/cookie";

type SsoEntryNetwork = "internal" | "external";
const subjectAccessHttp = createSubjectAccessHttpAdapter();

export interface SsoEndpointsOptions {
  logger: Pick<LoggerPort, "warn">;
  config: {
    authorizationEndpoint: string;
    logoutEndpoint: string;
    thirdPartyOAEndpoint: string;
    ssoExternalOrigin: string;
    ssoInternalOrigin: string;
  };
}

function joinOriginPath(origin: string, path: string) {
  return `${origin.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function resolveSsoOrigin(deps: SsoEndpointsOptions, entryNetwork: string | undefined) {
  if (entryNetwork === "internal") {
    return deps.config.ssoInternalOrigin;
  }
  if (entryNetwork === "external") {
    return deps.config.ssoExternalOrigin;
  }
  return null;
}

export function createSsoEndpointsHandler(deps: SsoEndpointsOptions) {
  const endpointsConfiguration: SsoRouteHandler<"endpointsConfiguration"> = async (c) => {
    const entryNetwork = c.req.header("X-IAM-Entry-Network") as SsoEntryNetwork | undefined;
    const origin = resolveSsoOrigin(deps, entryNetwork);
    if (origin === null) {
      deps.logger.warn({ entryNetwork }, "invalid sso entry network header");
      return c.json(resp.fail(ApiErrorCode.BadRequest, "非法 SSO 入口"), HttpStatusCodes.BAD_REQUEST);
    }

    return c.json(
      resp.ok({
        authorizationEndpoint: joinOriginPath(origin, deps.config.authorizationEndpoint),
        logoutEndpoint: joinOriginPath(origin, deps.config.logoutEndpoint),
        thirdPartyOAEndpoint: joinOriginPath(origin, deps.config.thirdPartyOAEndpoint),
      }),
      HttpStatusCodes.OK,
    );
  };

  return endpointsConfiguration;
}

export interface CreateRootSsoHandlersDeps {
  authentication: { loginWithOa: LoginWithOaUseCase; loginWithWechat: LoginWithWechatUseCase };
  config: { projectionRetryAfterSeconds: number; loginEndpoint: string; redisExpireSeconds: number };
  sso: {
    logout: {
      execute: (input: { sessionToken?: string; allowApplicationToken?: boolean }) => Promise<unknown>;
    };
  };
}

export function createRootSsoHandlers(deps: CreateRootSsoHandlersDeps) {
  const logout: SsoRouteHandler<"logout"> = async (c) => {
    const { redirectUrl, token } = c.req.valid("query");
    const globalSessionCookie = getCookie(c, "global_session");
    const sessionToken = globalSessionCookie ?? token;
    await runCustomSsoHttpBoundary(
      c,
      {
        clearCookiesOnInvalidSession: globalSessionCookie === undefined ? [] : ["global_session"],
        retryAfterSeconds: deps.config.projectionRetryAfterSeconds,
      },
      async () =>
        await deps.sso.logout.execute({
          sessionToken,
          allowApplicationToken: globalSessionCookie === undefined,
        }),
    );
    expireCustomSsoCookies(c, ["global_session"]);
    return c.redirect(redirectUrl ?? deps.config.loginEndpoint);
  };

  const loginOA: SsoRouteHandler<"loginOA"> = async (c) => {
    const { clientCode } = c.req.valid("param");
    const { loginid, ts, token, redirectUrl, client, state, ssoReturn } = c.req.valid("query");
    const globalSessionCookie = getCookie(c, "global_session");
    const sessionId = globalSessionCookie ?? c.req.header("Authorization");
    const data = await subjectAccessHttp.run(
      c,
      { clearCookiesOnInvalidSession: [] },
      async () => await deps.authentication.loginWithOa.execute(
        {
          clientCode,
          loginId: loginid,
          timestamp: ts,
          token,
          currentSessionToken: sessionId,
        },
        { requestContext: getApiAuditRequestContext(c) },
      ),
    );
    if (data.kind === "authenticated" || globalSessionCookie === undefined) {
      setCookie(c, "global_session", data.token, {
        httpOnly: true,
        sameSite: "Lax",
        maxAge: data.remainingSeconds ?? deps.config.redisExpireSeconds,
        path: "/",
      });
    }
    return c.redirect(
      buildAuthorizeResumeUrl({
        client,
        redirectUrl,
        state,
        token: data.token,
        ssoReturn,
      }),
    );
  };

  const loginWX: SsoRouteHandler<"loginWX"> = async (c) => {
    const { code, redirectUrl, client, state, ssoReturn } = c.req.valid("query");
    const data = await deps.authentication.loginWithWechat.execute(
      { code },
      { requestContext: getApiAuditRequestContext(c) },
    );
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: data.remainingSeconds ?? deps.config.redisExpireSeconds,
      path: "/",
    });
    return c.redirect(
      buildAuthorizeResumeUrl({
        client,
        redirectUrl,
        state,
        token: data.token,
        ssoReturn,
      }),
    );
  };

  return { logout, loginOA, loginWX };
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
    return await subjectAccessHttp.run(context, options, operation);
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
  ssoReturn?: string;
}) {
  const searchParams = new URLSearchParams({
    client: input.client,
    redirectUrl: input.redirectUrl,
    token: input.token,
  });
  if (input.state !== undefined)
    searchParams.set("state", input.state);
  if (input.ssoReturn !== undefined)
    searchParams.set("ssoReturn", input.ssoReturn);
  return `/sso/authorize?${searchParams.toString()}`;
}

export function parseBasicClientCredentials(authorization: string | undefined) {
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
  const clientCodeResult = ClientCodeSchema.safeParse(decodeCustomSsoClientCode(decoded.slice(0, separator)));
  if (!clientCodeResult.success)
    throw new InvalidSsoClientError("非法Client");
  return {
    clientCode: clientCodeResult.data,
    clientSecret: decoded.slice(separator + 1),
  };
}
