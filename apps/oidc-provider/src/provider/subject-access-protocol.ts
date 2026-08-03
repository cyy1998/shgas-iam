import type { ServerResponse } from "node:http";
import {
  SubjectAccessDisabledError,
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";

export interface OidcSubjectAccessContext {
  body: unknown;
  status: number;
  type: string;
  oidc?: {
    route?: string;
  };
  cookies: {
    set: (name: string, value: null, options: Record<string, unknown>) => void;
  };
}

export interface OidcSubjectAccessProtocolOptions {
  readonly cookieName: string;
  readonly cookieSecure: boolean;
  readonly clearGlobalSessionCookie: boolean;
}

export function handleOidcSubjectAccessProtocolError(
  error: unknown,
  context: OidcSubjectAccessContext,
  options: OidcSubjectAccessProtocolOptions,
) {
  if (
    error instanceof SubjectAccessSessionInvalidHttpError
    || error instanceof SubjectAccessDisabledError
  ) {
    if (options.clearGlobalSessionCookie) {
      context.cookies.set(options.cookieName, null, {
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        overwrite: true,
        path: "/",
        sameSite: "lax",
        secure: options.cookieSecure,
      });
    }
    context.status = 401;
    context.type = "application/json";
    context.body = {
      error: context.oidc?.route === "userinfo"
        ? "invalid_token"
        : "login_required",
    };
    return true;
  }

  if (error instanceof SubjectAccessUnavailableError) {
    context.status = 503;
    context.type = "application/json";
    context.body = { error: "temporarily_unavailable" };
    return true;
  }

  return false;
}

export function writeOidcSubjectAccessNodeResponse(
  error: unknown,
  response: ServerResponse,
  options: OidcSubjectAccessProtocolOptions,
) {
  if (
    error instanceof SubjectAccessSessionInvalidHttpError
    || error instanceof SubjectAccessDisabledError
  ) {
    if (options.clearGlobalSessionCookie && isCookieName(options.cookieName)) {
      const secure = options.cookieSecure ? "; Secure" : "";
      response.setHeader(
        "set-cookie",
        `${options.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${new Date(0).toUTCString()}${secure}`,
      );
    }
    writeProtocolError(response, 401, "login_required");
    return true;
  }

  if (error instanceof SubjectAccessUnavailableError) {
    writeProtocolError(response, 503, "temporarily_unavailable");
    return true;
  }

  return false;
}

function writeProtocolError(response: ServerResponse, status: number, error: string) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ error }));
}

function isCookieName(value: string) {
  return /^[!#$%&'*+\-.^\w`|~]+$/u.test(value);
}
