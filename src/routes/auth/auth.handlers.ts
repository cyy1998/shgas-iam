import type { AuthRouteHandler } from "./auth.types";
import { getCookie, setCookie } from "hono/cookie";
import config from "@/env";
import { AuthzUnauthorizedError } from "@/errors/AuthzUnauthorizedError";
import * as clientService from "@/services/client/client.service";
import * as resp from "@/utils/http/response";
import * as authService from "./auth.service";

export const loginPassword: AuthRouteHandler<"loginPassword"> = async (c) => {
  const { username, password } = c.req.valid("json");
  const data = await authService.loginPassword(username, password);
  setCookie(c, "global_session", data.token, {
    httpOnly: true,
    sameSite: "Strict", // 防 CSRF
    maxAge: config.REDIS_EXPIRE_TIME,
    path: "/",
  });
  return c.json(resp.ok(data));
};

export const loginMobile: AuthRouteHandler<"loginMobile"> = async (c) => {
  const { code, phoneNumber } = c.req.valid("json");
  const data = await authService.loginMobile(phoneNumber, code);
  setCookie(c, "global_session", data.token, {
    httpOnly: true,
    sameSite: "Strict", // 防 CSRF
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
  const clientSecret = c.req.header("apikey");
  if (!clientSecret) {
    throw new AuthzUnauthorizedError("非法访问");
  }
  const clientDto = await clientService.getClientBySecret(clientSecret);
  if (!clientDto) {
    throw new AuthzUnauthorizedError("无效secret");
  }
  return c.json(resp.ok(true));
};
