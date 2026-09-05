import {
  GatewayAuthzRequestHeadersSchema,
} from "@api/services/sso/transport/custom-sso-delivery-request.schema";
import {
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
} from "@api/services/sso/transport/custom-sso-delivery.security";
import {
  createCustomSsoUnavailableResponse,
} from "@api/services/sso/transport/custom-sso-retryable.openapi";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";

const routePrefix = "";
const tags = ["Auth"];

export const loginPassword = createRoute({
  method: "post",
  path: `${routePrefix}/login/password`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      credential: z.string().openapi({
        example: "iam-login-v1.eyJ2IjoxLCJhbGciOiJT...",
      }),
      capToken: z.string().optional(),
    }), "用户名密码登录参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        z.object({
          token: z.string().openapi({ example: "ed5776f0-5d5d-44a7-b44b-9505f5799a12" }),
          isMobileSet: z.boolean(),
        }),
      ),
      "登录成功",
    ),
  },
});

export const loginMobile = createRoute({
  method: "post",
  path: `${routePrefix}/login/mobile`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      phoneNumber: z.string().openapi({ example: "17721462865" }),
      code: z.string().openapi({ example: "1234" }),
      capToken: z.string().optional(),
    }), "手机登录参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        z.object({
          token: z.string().openapi({ example: "ed5776f0-5d5d-44a7-b44b-9505f5799a12" }),
          isMobileSet: z.boolean(),
        }),
      ),
      "登录成功",
    ),
  },
});

export const authz = createRoute({
  method: "get",
  path: `${routePrefix}/authz`,
  tags,
  description:
    "Requires encoded Client and trusted X-Forwarded-Uri headers plus an authenticated Local Session. OpenAPI clients use the raw Local Session ID through the Authorization security scheme; browser calls may instead use the IAM-managed local_{encodedClientCode}_session cookie.",
  security: [
    { [CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME]: [] },
  ],
  request: {
    headers: GatewayAuthzRequestHeadersSchema,
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: {
      ...jsonContent(createSuccessResponseSchema(z.string()), "准许"),
      headers: {
        "X-User-Info": {
          description: "与响应 data 完全相同的 Base64 Gateway Subject JSON",
          schema: { type: "string" },
        },
      },
    },
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: createCustomSsoUnavailableResponse(
      "Subject Access 或 Gateway Subject Projection 暂时不可用",
    ),
  },
});

export const internalAuthz = createRoute({
  method: "get",
  path: `${routePrefix}/internal-authz`,
  tags,
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "准许"),
  },
});
