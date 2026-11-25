import { Buffer } from "node:buffer";
import * as resp from "@iam/api-core/http";
import { decodeCustomSsoClientCode, expireCustomSsoCookies } from "@iam/api-core/http/custom-sso-transport";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/http/subject-access";
import { ApiErrorCode, ClientCodeSchema } from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";
import { InvalidSsoClientError } from "@iam/custom-sso";
import { mapCustomSsoRetryableError } from "@sso-api/middlewares/custom-sso-retryable.error";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { SsoRouteHandler } from "./sso.type";

type SsoEntryNetwork = "internal" | "external";
const subjectAccessHttp = createSubjectAccessHttpAdapter();

export interface SsoEndpointsOptions {
  logger: { warn: (context: object, message: string) => void };
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

interface LogoutHandlerOptions {
  config: { projectionRetryAfterSeconds: number; loginEndpoint: string };
  logout: (token: string | undefined, allowApplicationToken: boolean) => Promise<boolean>;
}

export function createLogoutHandler(deps: LogoutHandlerOptions) {
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
      () => deps.logout(sessionToken, globalSessionCookie === undefined),
    );
    expireCustomSsoCookies(c, ["global_session"]);
    return c.redirect(redirectUrl ?? deps.config.loginEndpoint);
  };

  return logout;
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
  } catch (error) {
    throw mapCustomSsoRetryableError(error, {
      retryAfterSeconds: options.retryAfterSeconds,
    });
  }
}

export function parseBasicClientCredentials(authorization: string | undefined) {
  if (authorization === undefined) throw new InvalidSsoClientError("非法Client");
  const match = /^Basic ([A-Z0-9+/]+={0,2})$/iu.exec(authorization);
  const encoded = match?.[1];
  if (encoded === undefined || encoded.length % 4 !== 0) throw new InvalidSsoClientError("非法Client");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw new InvalidSsoClientError("非法Client");

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidSsoClientError("非法Client");
  }
  const separator = decoded.indexOf(":");
  if (separator <= 0 || separator === decoded.length - 1) throw new InvalidSsoClientError("非法Client");
  const clientCodeResult = ClientCodeSchema.safeParse(decodeCustomSsoClientCode(decoded.slice(0, separator)));
  if (!clientCodeResult.success) throw new InvalidSsoClientError("非法Client");
  return {
    clientCode: clientCodeResult.data,
    clientSecret: decoded.slice(separator + 1),
  };
}
