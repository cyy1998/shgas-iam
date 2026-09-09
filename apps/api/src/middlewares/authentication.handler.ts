import type { ClientService } from "@api/services/client/client.service";
import type {
  CustomSsoSubjectDeliveryRequestScope,
} from "@api/services/sso/subject-delivery/custom-sso-subject-delivery-request-scope";
import type { CustomSso } from "@iam/custom-sso";
import type { Context, Next } from "hono";
import { mapCustomSsoRetryableError } from "@api/middlewares/custom-sso-retryable.error";
import {
  customSsoLocalSessionCookieName,
  decodeCustomSsoClientCode,
} from "@api/services/sso/transport/custom-sso-client-code.transport";
import { expireCustomSsoCookies } from "@api/services/sso/transport/custom-sso-cookie";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { BadRequestError } from "@iam/api-core/errors/BadRequestError";
import {
  createInternalAuthenticationHandler,
} from "@iam/api-core/middlewares";
import {
  createSubjectAccessHttpAdapter,
} from "@iam/api-core/subject-access";
import { ClientCodeSchema } from "@iam/contracts";
import {
  CustomSsoClientDeliveryUnauthorizedError,
  CustomSsoRequestMismatchError,
} from "@iam/custom-sso";
import { getCookie } from "hono/cookie";

const subjectAccessHttp = createSubjectAccessHttpAdapter();

export interface CreateApiAuthenticationHandlersDeps {
  clientService: Pick<ClientService, "getClientBySecret">;
  customSsoSession: Pick<
    CustomSso,
    "resolvePublicAuthentication"
  >;
  subjectDeliveryRequests: Pick<
    CustomSsoSubjectDeliveryRequestScope,
    "runWithCapability"
  >;
  config: {
    readonly projectionRetryAfterSeconds: number;
  };
}

export function createApiAuthenticationHandlers(deps: CreateApiAuthenticationHandlersDeps) {
  async function publicAuthenticationHandler(c: Context, next: Next) {
    const encodedClientCode = c.req.header("Client");
    const clientCodeResult = ClientCodeSchema.safeParse(
      encodedClientCode === undefined
        ? null
        : decodeCustomSsoClientCode(encodedClientCode),
    );
    if (!clientCodeResult.success) {
      throw new BadRequestError("非法请求");
    }
    const clientCode = clientCodeResult.data;

    const sessionCookieName = clientCode === "iam"
      ? "global_session"
      : customSsoLocalSessionCookieName(clientCode);
    const sessionCookie = getCookie(c, sessionCookieName);
    const authorizationHeader = c.req.header("Authorization");
    const sessionCredential = sessionCookie !== undefined
      ? { source: "cookie" as const, token: sessionCookie }
      : authorizationHeader === undefined
        ? null
        : {
            source: "authorization_header" as const,
            token: authorizationHeader,
          };
    if (sessionCredential === null) {
      throw new AuthzUnauthorizedError("未登录");
    }
    const sourceCookies = sessionCredential.source === "cookie"
      ? [sessionCookieName, "orcas_sso_sessionid"]
      : [];

    try {
      return await subjectAccessHttp.run(c, {
        clearCookiesOnInvalidSession: sourceCookies,
        retryAfterSeconds: deps.config.projectionRetryAfterSeconds,
      }, async () => {
        const resolved
          = await deps.customSsoSession.resolvePublicAuthentication(
            sessionCredential.token,
            clientCode,
          );
        const sessionContext = resolved.authenticationContext;
        c.set("subjectIdentifier", sessionContext.subjectIdentifier);
        c.set(
          "authenticatedClientCode",
          sessionContext.authenticatedClientCode,
        );
        if ("orcasId" in sessionContext
          && sessionContext.orcasId !== null
          && sessionContext.orcasId !== undefined) {
          c.set("orcasId", sessionContext.orcasId);
        }
        await deps.subjectDeliveryRequests.runWithCapability(
          c,
          resolved.subjectDeliveryCapability,
          async () => {
            await next();
            if (c.error !== undefined)
              throw c.error;
          },
        );
      });
    }
    catch (error) {
      if (
        error instanceof AuthzUnauthorizedError
        && !(error instanceof CustomSsoRequestMismatchError)
        && sourceCookies.length > 0
        && !(
          sessionCookieName === "global_session"
          && error instanceof CustomSsoClientDeliveryUnauthorizedError
        )
      ) {
        expireCustomSsoCookies(c, sourceCookies);
      }
      throw mapCustomSsoRetryableError(error, {
        retryAfterSeconds: deps.config.projectionRetryAfterSeconds,
      });
    }
  }

  return {
    publicAuthenticationHandler,
    internalAuthenticationHandler: createInternalAuthenticationHandler({
      getClientBySecret: deps.clientService.getClientBySecret,
    }),
  };
}

export type ApiAuthenticationHandlers = ReturnType<typeof createApiAuthenticationHandlers>;
