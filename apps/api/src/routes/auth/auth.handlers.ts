import type { AuthRouteHandler } from "./auth.type";
import config from "@api/env";
import * as clientService from "@api/services/client/client.service";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";
import { verifyInternalClient } from "@iam/api-core/middlewares";
import { getCookie, setCookie } from "hono/cookie";
import { getVerificationContext } from "../human-verification-context";
import * as authService from "./auth.service";
import { parseLoginPasswordCredential } from "./login-credential.helper";

export const loginPassword: AuthRouteHandler<"loginPassword"> = async (c) => {
  const { credential, capToken } = c.req.valid("json");
  const { username, password } = await parseLoginPasswordCredential(credential);
  const data = await authService.loginPassword(username, password, {
    capToken,
    context: getVerificationContext(c, username),
  });
  setCookie(c, "global_session", data.token, {
    httpOnly: true,
    sameSite: "Lax", // 防 CSRF；Lax 允许顶级导航带上 cookie，SSO 跨站跳回时会话不丢
    maxAge: config.REDIS_EXPIRE_TIME,
    path: "/",
  });
  return c.json(resp.ok(data));
};

export const loginMobile: AuthRouteHandler<"loginMobile"> = async (c) => {
  const { code, phoneNumber, capToken } = c.req.valid("json");
  const data = await authService.loginMobile(phoneNumber, code, {
    capToken,
    context: getVerificationContext(c, phoneNumber),
  });
  setCookie(c, "global_session", data.token, {
    httpOnly: true,
    sameSite: "Lax", // 防 CSRF；Lax 允许顶级导航带上 cookie，SSO 跨站跳回时会话不丢
    maxAge: config.REDIS_EXPIRE_TIME,
    path: "/",
  });
  return c.json(resp.ok(data));
};

export const authz: AuthRouteHandler<"authz"> = async (c) => {
  const clientCode = c.req.header("Client");
  const sessionId = getCookie(c, `local_${clientCode}_session`) ?? c.req.header("Authorization");
  if (!c.req.header("X-Forwarded-Uri") || !clientCode) {
    throw new AuthzUnauthorizedError("非法访问");
  }
  const client = await clientService.getClientByCode(clientCode);
  if (!client) {
    throw new AuthzUnauthorizedError("非法访问");
  }
  if (!sessionId) {
    throw new AuthzUnauthorizedError("未登录");
  }
  const data = await authService.authz(sessionId, client);
  c.header("X-User-Info", data);
  return c.json(resp.ok(data));
};

export const internalAuthz: AuthRouteHandler<"internalAuthz"> = async (c) => {
  await verifyInternalClient(c, {
    getClientBySecret: clientService.getClientBySecret,
  });
  return c.json(resp.ok(true));
};
