import { ClientCodeSchema } from "@iam/contracts";
import { AuthzUnauthorizedError, BadRequestError } from "@iam/runtime/errors";
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { MapCustomSsoRetryableErrorOptions } from "../http/custom-sso-retryable";
import {
  customSsoLocalSessionCookieName,
  decodeCustomSsoClientCode,
  expireCustomSsoCookies,
} from "../http/custom-sso-transport";
import { createSubjectAccessHttpAdapter } from "../http/subject-access";
import type { AuthenticatedSubjectVariables } from "../types/lib";

const subjectAccessHttp = createSubjectAccessHttpAdapter();

type PublicAuthentication<TCapability> = {
  authenticationContext: AuthenticatedSubjectVariables;
  subjectDeliveryCapability: TCapability;
};

export interface PublicAuthenticationDeps<TCapability> {
  /** Authenticate and await delivery within the same Subject Access operation. */
  runWithAuthentication: (
    token: string,
    clientCode: string,
    deliver: (authentication: PublicAuthentication<TCapability>) => Promise<void>,
  ) => Promise<void>;
  runWithCapability: (context: Context, capability: TCapability, next: Next) => Promise<void>;
  shouldPreserveSessionCookie: (error: AuthzUnauthorizedError, clientCode: string) => boolean;
  mapRetryableError: (error: unknown, options: MapCustomSsoRetryableErrorOptions) => unknown;
  retryAfterSeconds: number;
}

export function createPublicAuthenticationHandler<TCapability>(deps: PublicAuthenticationDeps<TCapability>) {
  return async function publicAuthenticationHandler(c: Context, next: Next) {
    const encodedClientCode = c.req.header("Client");
    const clientCodeResult = ClientCodeSchema.safeParse(
      encodedClientCode === undefined ? null : decodeCustomSsoClientCode(encodedClientCode),
    );
    if (!clientCodeResult.success) throw new BadRequestError("非法请求");
    const clientCode = clientCodeResult.data;

    const sessionCookieName = clientCode === "iam" ? "global_session" : customSsoLocalSessionCookieName(clientCode);
    const sessionCookie = getCookie(c, sessionCookieName);
    const token = sessionCookie ?? c.req.header("Authorization");
    if (token === undefined) throw new AuthzUnauthorizedError("未登录");
    const sourceCookies = sessionCookie === undefined ? [] : [sessionCookieName];

    try {
      await subjectAccessHttp.run(
        c,
        { clearCookiesOnInvalidSession: sourceCookies, retryAfterSeconds: deps.retryAfterSeconds },
        () =>
          deps.runWithAuthentication(token, clientCode, async (resolved) => {
            c.set("subjectIdentifier", resolved.authenticationContext.subjectIdentifier);
            c.set("authenticatedClientCode", resolved.authenticationContext.authenticatedClientCode);
            await deps.runWithCapability(c, resolved.subjectDeliveryCapability, async () => {
              await next();
              if (c.error !== undefined) throw c.error;
            });
          }),
      );
    } catch (error) {
      if (
        error instanceof AuthzUnauthorizedError &&
        sourceCookies.length > 0 &&
        !deps.shouldPreserveSessionCookie(error, clientCode)
      ) {
        expireCustomSsoCookies(c, sourceCookies);
      }
      throw deps.mapRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
    }
  };
}
