import * as resp from "@iam/api-core/http";
import {
  customSsoLocalSessionCookieName,
  decodeCustomSsoClientCode,
  expireCustomSsoCookies,
} from "@iam/api-core/http/custom-sso-transport";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/http/subject-access";
import { ClientCodeSchema } from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";
import { CustomSsoRequestMismatchError } from "@iam/custom-sso";
import { AuthzUnauthorizedError } from "@iam/runtime/errors";
import { mapCustomSsoRetryableError } from "@sso-api/middlewares/custom-sso-retryable.error";
import type { CustomSsoSubjectProjectionDto } from "@sso-api/services/sso/transport/custom-sso-subject.schema";
import { getCookie } from "hono/cookie";
import type { DeliveryRouteHandler } from "./sso.type";

const subjectAccessHttp = createSubjectAccessHttpAdapter();
export function createLocalSessionAuthzHandler(deps: {
  authorizeLocalSession: (token: string, clientCode: string) => Promise<string>;
  retryAfterSeconds: number;
}) {
  const authz: DeliveryRouteHandler<"authz"> = async (c) => {
    const encodedClientCode = c.req.header("Client");
    const clientCodeResult = ClientCodeSchema.safeParse(
      encodedClientCode === undefined ? null : decodeCustomSsoClientCode(encodedClientCode),
    );
    if (!c.req.header("X-Forwarded-Uri") || !clientCodeResult.success) {
      throw new AuthzUnauthorizedError("非法访问");
    }
    const clientCode = clientCodeResult.data;
    const localSessionCookieName = customSsoLocalSessionCookieName(clientCode);
    const localSessionCookie = getCookie(c, localSessionCookieName);
    const sessionId = localSessionCookie ?? c.req.header("Authorization");
    if (!sessionId) {
      throw new AuthzUnauthorizedError("未登录");
    }
    let data: Awaited<ReturnType<typeof deps.authorizeLocalSession>>;
    try {
      data = await subjectAccessHttp.run(
        c,
        {
          clearCookiesOnInvalidSession: localSessionCookie === undefined ? [] : [localSessionCookieName],
        },
        async () => {
          try {
            return await deps.authorizeLocalSession(sessionId, clientCode);
          } catch (error) {
            throw mapCustomSsoRetryableError(error, {
              retryAfterSeconds: deps.retryAfterSeconds,
            });
          }
        },
      );
    } catch (error) {
      if (
        error instanceof AuthzUnauthorizedError &&
        !(error instanceof CustomSsoRequestMismatchError) &&
        localSessionCookie !== undefined
      ) {
        expireCustomSsoCookies(c, [localSessionCookieName]);
      }
      throw error;
    }
    c.header("X-User-Info", data);
    return c.json(resp.ok(data), HttpStatusCodes.OK);
  };

  return authz;
}

export function createSubjectDeliveryHandler(deps: {
  resolveUserInfoForRequest: (request: object) => Promise<CustomSsoSubjectProjectionDto>;
  retryAfterSeconds: number;
}) {
  const userInfo: DeliveryRouteHandler<"userInfo"> = async (c) => {
    try {
      const data = await deps.resolveUserInfoForRequest(c);
      return c.json(resp.ok(data), HttpStatusCodes.OK);
    } catch (error) {
      throw mapCustomSsoRetryableError(error, {
        retryAfterSeconds: deps.retryAfterSeconds,
      });
    }
  };

  return userInfo;
}
