import type { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import type { UnifiedCustomSsoAuthorization } from "@iam/custom-sso";
import type { SsoRouteHandler } from "./sso.type";
import { mapCustomSsoRetryableError } from "@api/middlewares/custom-sso-retryable.error";
import { expireCustomSsoCookies } from "@api/services/sso/transport/custom-sso-cookie";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/subject-access";
import { appendNavigationParameters } from "@iam/contracts";
import { getCookie, setCookie } from "hono/cookie";

export function createUnifiedAuthorizationHandlers(deps: {
  authorization: UnifiedCustomSsoAuthorization;
  operations: ReturnType<typeof createSubjectAccessOperations>;
  loginEndpoint: string;
  retryAfterSeconds: number;
}) {
  const boundary = createSubjectAccessHttpAdapter();
  const authorize: SsoRouteHandler<"authorize"> = async (c) => {
    const { client, redirectUrl, state, token, ssoReturn } = c.req.valid("query");
    const cookie = getCookie(c, "global_session");
    const binding = getCookie(c, "custom_sso_continuation");
    let data;
    try {
      data = await boundary.run(
        c,
        { clearCookiesOnInvalidSession: cookie ? ["global_session"] : [] },
        async () =>
          await deps.operations.run(
            async operation =>
              await deps.authorization.forOperation(operation).authorize({
                clientCode: client,
                redirectUrl,
                state,
                continuation: ssoReturn,
                browserBinding: binding,
                globalSessionToken: cookie ?? c.req.header("Authorization") ?? token,
              }),
          ),
      );
    }
    catch (error) {
      throw mapCustomSsoRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
    }
    if (!data.isLogin) {
      if (data.clearGlobalSessionCookie)
        expireCustomSsoCookies(c, ["global_session"]);
      setCookie(c, "custom_sso_continuation", data.browserBinding, {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: data.continuationTtlSeconds,
      });
      const query = new URLSearchParams({
        client: data.clientCode,
        redirectUrl: data.redirectUrl,
        ssoReturn: data.continuation,
      });
      if (data.state !== undefined)
        query.set("state", data.state);
      return c.redirect(appendNavigationParameters(deps.loginEndpoint, query));
    }
    const callback = new URL(data.callbackEndpoint);
    callback.searchParams.set("client", data.clientCode);
    callback.searchParams.set("redirectUrl", data.redirectUrl);
    callback.searchParams.set("code", data.code);
    if (data.redeemer === "business" && data.state !== undefined)
      callback.searchParams.set("state", data.state);
    return c.redirect(callback.href);
  };
  const loginGuard: SsoRouteHandler<"loginGuard"> = async (c) => {
    const { client, redirectUrl, state, ssoReturn } = c.req.valid("query");
    let data;
    try {
      data = await deps.operations.run(
        async operation =>
          await deps.authorization.forOperation(operation).checkLoginContinuation({
            clientCode: client,
            redirectUrl,
            state,
            continuation: ssoReturn,
            browserBinding: getCookie(c, "custom_sso_continuation"),
            globalSessionToken: getCookie(c, "global_session"),
          }),
      );
    }
    catch (error) {
      throw mapCustomSsoRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
    }
    if (data.clearGlobalSessionCookie)
      expireCustomSsoCookies(c, ["global_session"]);
    return c.json(resp.ok({ decision: data.decision }), HttpStatusCodes.OK);
  };
  return { authorize, loginGuard };
}
