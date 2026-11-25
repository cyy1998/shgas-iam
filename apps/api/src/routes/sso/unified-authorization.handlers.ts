import { mapCustomSsoRetryableError } from "@api/middlewares/custom-sso-retryable.error";
import { getRequestId, getTraceId } from "@iam/api-core/core/request-context";
import * as resp from "@iam/api-core/http";
import { expireCustomSsoCookies } from "@iam/api-core/http/custom-sso-transport";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/http/subject-access";
import { appendNavigationParameters, buildApplicationAccessDeniedPath, ClientCodeSchema } from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";
import type { CustomSsoLoggerPort, UnifiedCustomSsoAuthorization } from "@iam/custom-sso";
import { BadRequestError } from "@iam/runtime/errors";
import type { createSubjectAccessOperations } from "@iam/subject-access";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { SsoRouteHandler } from "./sso.type";
import type { InspectWechatQrContinuation } from "./wechat-qr.http";

export function createUnifiedAuthorizationHandlers(deps: {
  authorization: {
    forOperation: (
      operation: Parameters<UnifiedCustomSsoAuthorization["forOperation"]>[0],
    ) => Pick<ReturnType<UnifiedCustomSsoAuthorization["forOperation"]>, "authorize" | "checkLoginContinuation">;
  };
  operations: ReturnType<typeof createSubjectAccessOperations>;
  logger: Pick<CustomSsoLoggerPort, "warn">;
  loginEndpoint: string;
  retryAfterSeconds: number;
  wechatQrEnabled?: boolean;
}) {
  const boundary = createSubjectAccessHttpAdapter();
  const authorize: SsoRouteHandler<"authorize"> = async (c) => {
    const { client, redirectUrl, state, token, ssoReturn } = c.req.valid("query");
    c.header("Cache-Control", "no-store");
    const cookie = getCookie(c, "global_session");
    const binding = getCookie(c, "custom_sso_continuation");
    let data: Awaited<ReturnType<ReturnType<typeof deps.authorization.forOperation>["authorize"]>>;
    try {
      data = await boundary.run(
        c,
        { clearCookiesOnInvalidSession: cookie ? ["global_session"] : [] },
        async () =>
          await deps.operations.run(
            async (operation) =>
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
    } catch (error) {
      throw mapCustomSsoRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
    }
    if (data.kind === "denied") {
      deps.logger.warn(
        {
          event: "application.admission.denied",
          outcome: "no-match",
          protocol: "custom_sso",
          clientCode: data.clientCode,
          requestId: getRequestId(c) ?? c.req.header("x-request-id") ?? null,
          traceId: getTraceId(c),
        },
        "Application admission denied",
      );
      return c.redirect(buildApplicationAccessDeniedPath(data.clientCode));
    }
    if (data.kind === "login") {
      if (data.clearGlobalSessionCookie) expireCustomSsoCookies(c, ["global_session"]);
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
      if (data.state !== undefined) query.set("state", data.state);
      return c.redirect(appendNavigationParameters(deps.loginEndpoint, query));
    }
    const callback = new URL(data.callbackEndpoint);
    callback.searchParams.set("client", data.clientCode);
    callback.searchParams.set("redirectUrl", data.redirectUrl);
    callback.searchParams.set("code", data.code);
    callback.searchParams.delete("state");
    if (data.redeemer === "business" && data.state !== undefined) callback.searchParams.set("state", data.state);
    return c.redirect(callback.href);
  };
  const loginGuard: SsoRouteHandler<"loginGuard"> = async (c) => {
    const { client, redirectUrl, state, ssoReturn } = c.req.valid("query");
    let data: Awaited<ReturnType<ReturnType<typeof deps.authorization.forOperation>["checkLoginContinuation"]>>;
    try {
      data = await deps.operations.run(
        async (operation) =>
          await deps.authorization.forOperation(operation).checkLoginContinuation({
            clientCode: client,
            redirectUrl,
            state,
            continuation: ssoReturn,
            browserBinding: getCookie(c, "custom_sso_continuation"),
            globalSessionToken: getCookie(c, "global_session"),
          }),
      );
    } catch (error) {
      throw mapCustomSsoRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
    }
    if (data.clearGlobalSessionCookie) expireCustomSsoCookies(c, ["global_session"]);
    const wechatQr =
      deps.wechatQrEnabled &&
      data.decision === "login" &&
      ssoReturn &&
      c.req.header("X-IAM-Entry-Network") === "internal";
    return c.json(
      resp.ok({ decision: data.decision, ...(wechatQr ? { wechatQr: true as const } : {}) }),
      HttpStatusCodes.OK,
    );
  };
  return { authorize, loginGuard };
}

const wechatCustomContinuation = z.object({
  client: ClientCodeSchema,
  redirectUrl: z.url(),
  state: z.string().optional(),
  ssoReturn: z.string().regex(/^[\w-]{43}$/u),
});

export function createInspectCustomSsoWechatQr(deps: {
  inspectLoginContinuation: ReturnType<UnifiedCustomSsoAuthorization["forOperation"]>["inspectLoginContinuation"];
  retryAfterSeconds: number;
}): InspectWechatQrContinuation {
  return async (c) => {
    const query = wechatCustomContinuation.safeParse(c.req.query());
    const browserBinding = getCookie(c, "custom_sso_continuation");
    if (!query.success || !browserBinding) throw new BadRequestError("登录请求无效");
    const { client, redirectUrl, state, ssoReturn } = query.data;
    try {
      const continuation = await deps.inspectLoginContinuation({
        clientCode: client,
        redirectUrl,
        state,
        continuation: ssoReturn,
        browserBinding,
        globalSessionToken: getCookie(c, "global_session"),
      });
      return {
        clientCode: continuation.clientCode,
        expiresAt: continuation.expiresAt,
        root: continuation.root,
        browser: { protocol: "custom_sso", continuation: ssoReturn, browserBinding },
      };
    } catch (error) {
      throw mapCustomSsoRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
    }
  };
}
