import type { SsoRouteHandler } from "./sso.type";
import { ClientManagementLevel } from "@api/enums/client.managementLevel";
import config from "@api/env";
import * as clientService from "@api/services/client/client.service";
import * as sessionService from "@api/services/session/session.service";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";
import { getProtocolAndHost } from "@iam/api-core/utils";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as ssoService from "./sso.service";

export const endpointsConfiguration: SsoRouteHandler<"endpointsConfiguration"> = async (c) => {
  const origin = (new URL(c.req.url)).origin;
  return c.json(resp.ok({
    authorizationEndpoint: `${origin}${config.AUTHORIZATION_ENDPOINT}`,
    logoutEndpoint: `${origin}${config.LOGOUT_ENDPOINT}`,
    thirdPartyOAEndpoint: `${origin}${config.THIRDPARTY_OA_ENDPOINT}`,
  }));
};

export const callback: SsoRouteHandler<"callback"> = async (c) => {
  const { code, client, redirectUrl } = c.req.valid("query");
  const data = await ssoService.callback(code, client, redirectUrl);
  setCookie(c, `local_${client}_session`, data.token, {
    httpOnly: true,
    sameSite: "Lax", // 防 CSRF；Lax 允许顶级导航带上 cookie，SSO 跨站跳回时会话不丢
    maxAge: config.REDIS_EXPIRE_TIME,
    path: "/",
  });
  const urlObject = new URL(redirectUrl);
  urlObject.searchParams.set("token", data.token);
  if (data.orcasSessionId != null) {
    setCookie(c, `orcas_sso_sessionid`, data.orcasSessionId, {
      httpOnly: true,
      sameSite: "Lax", // 防 CSRF；Lax 允许顶级导航带上 cookie，SSO 跨站跳回时会话不丢
      maxAge: config.REDIS_EXPIRE_TIME,
      path: "/",
    });
    urlObject.searchParams.set("orcasToken", data.orcasSessionId);
  }
  return c.redirect(urlObject.toString());
};

export const token: SsoRouteHandler<"token"> = async (c) => {
  const { code, client, clientSecret } = c.req.valid("query");
  const data = await ssoService.setToken(code, client, clientSecret);
  return c.json(resp.ok(data));
};

export const authorize: SsoRouteHandler<"authorize"> = async (c) => {
  const { client, redirectUrl, token } = c.req.valid("query");
  const searchParams = new URLSearchParams(c.req.query());
  const sessionId = getCookie(c, "global_session") ?? c.req.header("Authorization") ?? token;
  const clientDto = await clientService.getClientByCode(client);
  // if(clientDto.)
  const data = await ssoService.authorize(sessionId, client, redirectUrl);
  if (data.isLogin === false) {
    return c.redirect(`${config.LOGIN_ENDPOINT}?${searchParams.toString()}`);
  }
  const callbackPath = clientDto?.extAttributes.managementLevel === ClientManagementLevel.Gateway
    ? `${getProtocolAndHost(redirectUrl)}/sso/callback`
    : `${clientDto?.extAttributes.callbackEndpoint}`;
  return c.redirect(`${callbackPath}?code=${data.code}&client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`);
};

export const logout: SsoRouteHandler<"logout"> = async (c) => {
  const { redirectUrl, token } = c.req.valid("query");
  const sessionId = getCookie(c, "global_session") ?? await sessionService.getGlobalSessionIdByLocalSession(token ?? "");
  if (!sessionId) {
    throw new AuthzUnauthorizedError("缺少有效SessionId");
  }
  await ssoService.logout(sessionId);
  deleteCookie(c, "global_session");
  return c.redirect(redirectUrl ?? config.LOGIN_ENDPOINT);
};

export const loginOA: SsoRouteHandler<"loginOA"> = async (c) => {
  const { clientCode } = c.req.valid("param");
  const { loginid, ts, token, redirectUrl, client } = c.req.valid("query");
  const sessionId = getCookie(c, "global_session") ?? c.req.header("Authorization");
  if (sessionId) {
    await ssoService.logout(sessionId);
  }
  const data = await ssoService.loginOA(clientCode, loginid, ts, token);
  setCookie(c, "global_session", data.token, {
    httpOnly: true,
    sameSite: "Lax", // 防 CSRF；Lax 允许顶级导航带上 cookie，SSO 跨站跳回时会话不丢
    maxAge: config.REDIS_EXPIRE_TIME,
    path: "/",
  });
  return c.redirect(`/sso/authorize?client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}&token=${data.token}`);
};

export const loginWX: SsoRouteHandler<"loginWX"> = async (c) => {
  const { code, redirectUrl, client } = c.req.valid("query");
  const data = await ssoService.loginWX(code);
  setCookie(c, "global_session", data.token, {
    httpOnly: true,
    sameSite: "Lax", // 防 CSRF；Lax 允许顶级导航带上 cookie，SSO 跨站跳回时会话不丢
    maxAge: config.REDIS_EXPIRE_TIME,
    path: "/",
  });
  return c.redirect(`/sso/authorize?client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}&token=${data.token}`);
};
