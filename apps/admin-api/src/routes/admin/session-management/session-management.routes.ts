import {
  SessionManagementListLoginRestrictionsInputSchema,
  SessionManagementListSessionsInputSchema,
  SessionManagementLoginRestrictionListResultVoSchema,
  SessionManagementReleaseLoginRestrictionResultVoSchema,
  SessionManagementRevokeSessionsInputSchema,
  SessionManagementRevokeSessionsResultVoSchema,
  SessionManagementSessionListResultVoSchema,
} from "@admin-api/routes/admin/session-management/session-management.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { StandardErrorResponseSchema } from "@iam/api-core/core/openapi/schemas/error-response-schema";

const tags = ["Admin/Session Management"];

export const sessionsSearch = createRoute({
  method: "post",
  path: "/sessions/search",
  tags,
  request: {
    body: jsonContentRequired(SessionManagementListSessionsInputSchema, "会话记录分页查询参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(SessionManagementSessionListResultVoSchema),
      "分页会话记录列表",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      StandardErrorResponseSchema,
      "登录状态服务不可用",
    ),
  },
});

export const sessionsRevoke = createRoute({
  method: "post",
  path: "/sessions/revoke",
  tags,
  request: {
    body: jsonContentRequired(SessionManagementRevokeSessionsInputSchema, "单个或用户全部会话记录撤销参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(SessionManagementRevokeSessionsResultVoSchema),
      "单个或用户全部会话记录撤销结果",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      StandardErrorResponseSchema,
      "登录状态服务不可用",
    ),
  },
});

export const loginRestrictionsSearch = createRoute({
  method: "post",
  path: "/login-restrictions/search",
  tags,
  request: {
    body: jsonContentRequired(
      SessionManagementListLoginRestrictionsInputSchema,
      "临时登录限制分页查询参数",
    ),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(SessionManagementLoginRestrictionListResultVoSchema),
      "分页临时登录限制列表",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      StandardErrorResponseSchema,
      "登录状态服务不可用",
    ),
  },
});

export const loginRestrictionRelease = createRoute({
  method: "delete",
  path: "/login-restrictions/{userId}",
  tags,
  request: {
    params: z.object({
      userId: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(SessionManagementReleaseLoginRestrictionResultVoSchema),
      "临时登录限制解除结果",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      StandardErrorResponseSchema,
      "登录状态服务不可用",
    ),
  },
});
