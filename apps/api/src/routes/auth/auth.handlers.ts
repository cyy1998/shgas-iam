import type { AuthRouteHandler } from "./auth.types";
import config from "@api/env";
import { logger } from "@api/lib/logger";
import * as clientService from "@api/services/client/client.service";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";
import { getCookie, setCookie } from "hono/cookie";
import * as authService from "./auth.service";

type HeaderContext = {
  req: {
    header: (name: string) => string | undefined;
  };
};

function getRequestIp(c: HeaderContext) {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor
    ?? c.req.header("x-real-ip")
    ?? c.req.header("cf-connecting-ip")
    ?? undefined;
}

function getVerificationContext(c: HeaderContext, subject?: string) {
  return {
    subject,
    ip: getRequestIp(c),
    client: c.req.header("Client"),
  };
}

export const loginPassword: AuthRouteHandler<"loginPassword"> = async (c) => {
  const { username, password, capToken } = c.req.valid("json");
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
  const clientSecret = c.req.header("apikey");
  const sourceIp = c.req.header("IP-Chain");
  logger.info(sourceIp);
  if (["192.168.93.", "192.168.73.88"].some(key => sourceIp?.includes(key))) {
    return c.json(resp.ok(true));
  }
  if (!clientSecret) {
    throw new AuthzUnauthorizedError("非法访问");
  }
  const clientDto = await clientService.getClientBySecret(clientSecret);
  if (!clientDto) {
    throw new AuthzUnauthorizedError("无效secret");
  }
  return c.json(resp.ok(true));
};
