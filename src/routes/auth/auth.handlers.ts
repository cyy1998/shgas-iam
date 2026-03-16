import type { AuthRouteHandler } from "./auth.types";
import { getCookie, setCookie } from "hono/cookie";
import config from "@/env";
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
  const clientCode = c.req.header("Client") ?? null;
  const sessionId = getCookie(c, `local_${clientCode}_session`) ?? c.req.header("Authorization") ?? null;
  const data = await authService.authz(sessionId, clientCode, c.req.header("X-Forwarded-Uri"));
  c.header("X-User-Info", data);
  return c.json(resp.ok(data));
};
