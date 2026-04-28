import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@/lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { SSOMetaInfoSchema } from "./sso.schema";

const routePrefix = "";
const tags = ["SSO"];

export const endpointsConfiguration = createRoute({
  method: "get",
  path: `${routePrefix}/.well-known/authentication-configuration`,
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(SSOMetaInfoSchema), "单点登录端点信息"),
  },
});

export const callback = createRoute({
  method: "get",
  path: `${routePrefix}/callback`,
  tags,
  request: {
    query: z.object({
      code: z.string().openapi({ example: "dw98qr3hoi2hn" }),
      client: z.string().openapi({ example: "tender" }),
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
    }),
  },
  responses: {
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "本地会话回调成功",
    },
  },
});

export const token = createRoute({
  method: "get",
  path: `${routePrefix}/token`,
  tags,
  request: {
    query: z.object({
      code: z.string().openapi({ example: "dw98qr3hoi2hn" }),
      client: z.string().openapi({ example: "tender" }),
      clientSecret: z.string().openapi({ example: "jt123456" }),
    }),
  },
  responses: {
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "本地会话回调成功",
    },
  },
});

export const authorize = createRoute({
  method: "get",
  path: `${routePrefix}/authorize`,
  tags,
  request: {
    query: z.object({
      client: z.string().openapi({ example: "tender" }),
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      token: z.string().optional().openapi({ example: "abcd" }),
    }),
  },
  responses: {
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "全局未登录，跳转登录页面",
    },
  },
});

export const logout = createRoute({
  method: "get",
  path: `${routePrefix}/logout`,
  tags,
  request: {
    query: z.object({
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      token: z.string().optional().openapi({ example: "abcd" }),
    }),
  },
  responses: {
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "登出成功",
    },
  },
});

export const loginOA = createRoute({
  method: "get",
  path: `${routePrefix}/third-party/:clientCode`,
  tags,
  request: {
    params: z.object({
      clientCode: z.string().openapi({ example: "oa" }),
    }),
    query: z.object({
      loginid: z.string().openapi({ example: "138550" }),
      ts: z.string().openapi({ example: "1234" }),
      token: z.string().openapi({ example: "138550" }),
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      client: z.string().openapi({ example: "tender" }),
    }),
  },
  responses: {
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "OA登录成功",
    },
  },
});

export const loginWX = createRoute({
  method: "get",
  path: `${routePrefix}/third-party/wx`,
  tags,
  request: {
    query: z.object({
      code: z.string().openapi({ example: "1234" }),
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      client: z.string().openapi({ example: "tender" }),
    }),
  },
  responses: {
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "微信登录成功",
    },
  },
});
