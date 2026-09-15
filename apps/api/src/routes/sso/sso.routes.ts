import {
  createCustomSsoUnavailableResponse,
} from "@api/services/sso/transport/custom-sso-retryable.openapi";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { ClientCodeSchema } from "@iam/contracts";
import {
  LoginPageGuardResultSchema,
  SSOMetaInfoSchema,
  SsoTokenResultSchema,
} from "./sso.schema";
import { CUSTOM_SSO_BASIC_SECURITY_SCHEME } from "./sso.security";

const routePrefix = "";
const tags = ["SSO"];
const CustomSsoClientCodeSchema = ClientCodeSchema
  .meta({
    description: "Client Code",
    example: "tender",
  });
const customSsoUnavailableResponse = createCustomSsoUnavailableResponse(
  "Subject Access 或 Client Subject Projection 暂时不可用",
);

export const endpointsConfiguration = createRoute({
  method: "get",
  path: `${routePrefix}/.well-known/authentication-configuration`,
  tags,
  request: {
    headers: z.object({
      "X-IAM-Entry-Network": z.enum(["internal", "external"]).openapi({
        description: "Trusted entry network injected by APISIX according to the matched SSO host.",
        example: "external",
      }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(SSOMetaInfoSchema), "单点登录端点信息"),
  },
});

export const callback = createRoute({
  method: "get",
  path: `${routePrefix}/callback`,
  description: "授权码通过前置校验后一次消费。失败或响应丢失时返回业务应用重新发起访问；不要刷新携带旧 Code 的 callback。暂态失败可等待 Retry-After 后重新授权，有效根会话可续接。",
  tags,
  request: {
    query: z.object({
      code: z.string().openapi({ example: "dw98qr3hoi2hn" }),
      client: CustomSsoClientCodeSchema,
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "本地会话回调成功",
    },
    [HttpStatusCodes.SERVICE_UNAVAILABLE]:
      customSsoUnavailableResponse,
  },
});

export const token = createRoute({
  method: "post",
  path: `${routePrefix}/token`,
  tags,
  description: "暂态失败、内部失败或结果未知后放弃旧 Code，重新授权；有效根会话通常可续接。参数、Client 认证或配置错误须先修正。",
  security: [{ [CUSTOM_SSO_BASIC_SECURITY_SCHEME]: [] }],
  request: {
    body: {
      content: {
        "application/x-www-form-urlencoded": {
          schema: z.object({
            code: z.string().min(1).openapi({ example: "dw98qr3hoi2hn" }),
            redirect_uri: z.url().openapi({
              example: "https://client.example.com/sso/callback",
            }),
          }).strict(),
        },
      },
      required: true,
    },
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(SsoTokenResultSchema),
      "Independent credential 与受控主体投影",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]:
      createCustomSsoUnavailableResponse(
        "兑换暂时不可用；放弃旧 Code，等待后重新授权，不重放 token 请求",
        "开始新授权前等待的秒数，不表示重试旧 Code",
      ),
  },
});

export const authorize = createRoute({
  method: "get",
  path: `${routePrefix}/authorize`,
  tags,
  request: {
    query: z.object({
      ssoReturn: z.string().regex(/^[\w-]{43}$/u).optional(),
      client: CustomSsoClientCodeSchema,
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      state: z.string().optional().openapi({ example: "opaque-client-state" }),
      token: z.string().optional().openapi({ example: "abcd" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "全局未登录，跳转登录页面",
    },
    [HttpStatusCodes.SERVICE_UNAVAILABLE]:
      customSsoUnavailableResponse,
  },
});

export const loginGuard = createRoute({
  method: "get",
  path: `${routePrefix}/login-guard`,
  tags,
  request: {
    query: z.object({
      ssoReturn: z.string().regex(/^[\w-]{43}$/u).optional(),
      client: CustomSsoClientCodeSchema,
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      state: z.string().optional().openapi({ example: "opaque-client-state" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(LoginPageGuardResultSchema),
      "统一登录页重入守卫决策",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: customSsoUnavailableResponse,
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
    ...commonErrorResponses,
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "登出成功",
    },
    [HttpStatusCodes.SERVICE_UNAVAILABLE]:
      customSsoUnavailableResponse,
  },
});

export const loginOA = createRoute({
  method: "get",
  path: `${routePrefix}/thirdparty/:clientCode`,
  tags,
  request: {
    params: z.object({
      clientCode: CustomSsoClientCodeSchema.openapi({ example: "oa" }),
    }),
    query: z.object({
      ssoReturn: z.string().regex(/^[\w-]{43}$/u).optional(),
      loginid: z.string().openapi({ example: "138550" }),
      ts: z.string().openapi({ example: "1234" }),
      token: z.string().openapi({ example: "138550" }),
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      client: CustomSsoClientCodeSchema,
      state: z.string().optional().openapi({ example: "opaque-client-state" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
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
      ssoReturn: z.string().regex(/^[\w-]{43}$/u).optional(),
      code: z.string().openapi({ example: "1234" }),
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      client: CustomSsoClientCodeSchema,
      state: z.string().optional().openapi({ example: "opaque-client-state" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "微信登录成功",
    },
  },
});
