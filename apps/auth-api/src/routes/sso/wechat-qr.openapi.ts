import { createRoute, z } from "@hono/zod-openapi";
import type { createRouter } from "@iam/api-core/core/create-router";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import {
  WechatQrBindPasswordSchema,
  WechatQrBindSmsSchema,
  WechatQrCompleteResponseSchema,
  WechatQrEventSchema,
  WechatQrIdSchema,
  WechatQrSendSmsResponseSchema,
  WechatQrSendSmsSchema,
  WechatQrStartResultSchema,
} from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";
import { WechatQrContinuationQuery } from "./wechat-qr-continuation.http";

const tags = ["企业微信扫码"];
const continuationSchema = "WechatQrContinuation";
const continuationParameter = {
  name: "continuation",
  in: "query",
  required: true,
  style: "form",
  explode: true,
  schema: { $ref: `#/components/schemas/${continuationSchema}` },
} as const;
const requestId = z.object({ requestId: WechatQrIdSchema });
const flowId = z.object({ flowId: WechatQrIdSchema });
const desktopDescription = "仅接受内网入口。发送原协议的续接参数和浏览器绑定 Cookie。";

export function registerWechatQrDesktopPaths(router: ReturnType<typeof createRouter>) {
  router.openAPIRegistry.register(continuationSchema, WechatQrContinuationQuery);
  router.openAPIRegistry.registerPath(
    createRoute({
      method: "post",
      path: "/",
      tags,
      summary: "生成二维码或继续已有登录",
      description: desktopDescription,
      parameters: [continuationParameter],
      responses: {
        ...commonErrorResponses,
        [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(WechatQrStartResultSchema), "扫码或继续"),
      },
    }),
  );
  router.openAPIRegistry.registerPath(
    createRoute({
      method: "get",
      path: "/{requestId}/status",
      tags,
      summary: "查询二维码状态",
      description: desktopDescription,
      parameters: [continuationParameter],
      request: { params: requestId },
      responses: {
        ...commonErrorResponses,
        [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(WechatQrEventSchema), "当前状态"),
      },
    }),
  );
  router.openAPIRegistry.registerPath(
    createRoute({
      method: "get",
      path: "/{requestId}/events",
      tags,
      summary: "订阅二维码状态",
      description: desktopDescription,
      parameters: [continuationParameter],
      request: { params: requestId },
      responses: {
        ...commonErrorResponses,
        [HttpStatusCodes.OK]: {
          description: "SSE data 为包含 status 字段的 JSON 对象",
          content: { "text/event-stream": { schema: z.string() } },
        },
      },
    }),
  );
  router.openAPIRegistry.registerPath(
    createRoute({
      method: "post",
      path: "/{requestId}/complete",
      tags,
      summary: "完成扫码登录",
      description: desktopDescription,
      parameters: [continuationParameter],
      request: { params: requestId },
      responses: {
        ...commonErrorResponses,
        [HttpStatusCodes.OK]: jsonContent(
          createSuccessResponseSchema(WechatQrCompleteResponseSchema.shape.data),
          "登录结果",
        ),
      },
    }),
  );
  for (const binding of [
    { path: "/{requestId}/bind/password", summary: "用密码绑定并登录", body: WechatQrBindPasswordSchema },
    { path: "/{requestId}/bind/sms/send", summary: "发送绑定验证码", body: WechatQrSendSmsSchema },
    { path: "/{requestId}/bind/sms", summary: "用短信验证码绑定并登录", body: WechatQrBindSmsSchema },
  ]) {
    const result = binding.path.endsWith("/send") ? WechatQrSendSmsResponseSchema : WechatQrCompleteResponseSchema;
    router.openAPIRegistry.registerPath(
      createRoute({
        method: "post",
        path: binding.path,
        tags,
        summary: binding.summary,
        description: desktopDescription,
        parameters: [continuationParameter],
        request: { params: requestId, body: jsonContentRequired(binding.body, "企业微信身份绑定凭据") },
        responses: {
          ...commonErrorResponses,
          [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(result.shape.data), "绑定流程结果"),
        },
      }),
    );
  }
}

export function registerWechatQrMobilePaths(router: ReturnType<typeof createRouter>) {
  const html = { content: { "text/html": { schema: z.string() } } };
  const errors = {
    [HttpStatusCodes.BAD_REQUEST]: { ...html, description: "扫码请求已失效" },
    [HttpStatusCodes.NOT_FOUND]: { description: "入口不可用" },
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: { ...html, description: "登录服务暂时不可用" },
  };
  router.openAPIRegistry.registerPath(
    createRoute({
      method: "get",
      path: "/{requestId}",
      tags,
      summary: "在手机上发起企业微信授权",
      request: { params: requestId },
      responses: { ...errors, [HttpStatusCodes.MOVED_TEMPORARILY]: { description: "跳转至企业微信" } },
    }),
  );
  router.openAPIRegistry.registerPath(
    createRoute({
      method: "get",
      path: "/callback",
      tags,
      summary: "接收企业微信授权回调",
      request: { query: z.object({ state: WechatQrIdSchema, code: z.string() }) },
      responses: { ...errors, [HttpStatusCodes.SEE_OTHER]: { description: "跳转至确认页" } },
    }),
  );
  router.openAPIRegistry.registerPath(
    createRoute({
      method: "get",
      path: "/confirm/{flowId}",
      tags,
      summary: "显示扫码确认页",
      request: { params: flowId },
      responses: { ...errors, [HttpStatusCodes.OK]: { ...html, description: "确认页" } },
    }),
  );
  router.openAPIRegistry.registerPath(
    createRoute({
      method: "post",
      path: "/decision",
      tags,
      summary: "确认或取消扫码登录",
      request: {
        body: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({ flow: WechatQrIdSchema, action: z.enum(["confirm", "cancel"]) }),
            },
          },
        },
      },
      responses: { ...errors, [HttpStatusCodes.OK]: { ...html, description: "确认结果" } },
    }),
  );
}
