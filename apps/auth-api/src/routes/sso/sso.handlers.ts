import { getApiAuditRequestContext } from "@auth-api/services/audit/audit.context";
import type { LoginWithOaUseCase } from "@auth-api/use-cases/authentication/login-with-oa/login-with-oa.use-case";
import type { LoginWithWechatUseCase } from "@auth-api/use-cases/authentication/login-with-wechat/login-with-wechat.use-case";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/http/subject-access";
import { getCookie, setCookie } from "hono/cookie";
import type { SsoRouteHandler } from "./sso.type";

const subjectAccessHttp = createSubjectAccessHttpAdapter();

export interface CreateRootSsoHandlersDeps {
  authentication: { loginWithOa: LoginWithOaUseCase; loginWithWechat: LoginWithWechatUseCase };
  config: { userSessionTtlSeconds: number };
}

export function createRootSsoHandlers(deps: CreateRootSsoHandlersDeps) {
  const loginOA: SsoRouteHandler<"loginOA"> = async (c) => {
    const { clientCode } = c.req.valid("param");
    const { loginid, ts, token, redirectUrl, client, state, ssoReturn } = c.req.valid("query");
    const globalSessionCookie = getCookie(c, "global_session");
    const sessionId = globalSessionCookie ?? c.req.header("Authorization");
    const data = await subjectAccessHttp.run(
      c,
      { clearCookiesOnInvalidSession: [] },
      async () =>
        await deps.authentication.loginWithOa.execute(
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
        maxAge: data.remainingSeconds ?? deps.config.userSessionTtlSeconds,
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
      maxAge: data.remainingSeconds ?? deps.config.userSessionTtlSeconds,
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

  return { loginOA, loginWX };
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
  if (input.state !== undefined) searchParams.set("state", input.state);
  if (input.ssoReturn !== undefined) searchParams.set("ssoReturn", input.ssoReturn);
  return `/sso/authorize?${searchParams.toString()}`;
}
