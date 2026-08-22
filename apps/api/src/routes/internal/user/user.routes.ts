import { PrivilegeDelegationDtoSchema } from "@api/services/privilege/privilegeDelegation.schema";
import { UserDtoSchema, UserQueryDtoSchema, UserQueryWithPrivilegeDelegationDtoSchema } from "@api/services/user/user.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import {
  StandardErrorResponseSchema,
  ValidationFailureResponseSchema,
} from "@iam/api-core/core/openapi/schemas/error-response-schema";
import {
  UserProfileDetailDocumentSchema,
} from "@iam/user-profile-read-model";
import {
  V3UserProfileSearchTransportRequestSchema,
} from "@iam/user-profile-read-model/v3";

const tags = ["Internal/User"];

export const userInfo = createRoute({
  method: "get",
  path: "/:username",
  tags,
  request: {
    params: z.object({
      username: z.string().openapi({ example: "123456" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      StandardErrorResponseSchema,
      "用户详情暂时不可用",
    ),
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(UserProfileDetailDocumentSchema),
      "用户详细信息",
    ),
  },
});

export const usersSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  deprecated: true,
  request: {
    body: jsonContentRequired(UserQueryDtoSchema, "用户搜索条件"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户搜索结果"),
  },
});

export const usersSearchWithPrivilegeDelegation = createRoute({
  method: "post",
  path: "/search-with-delegation",
  tags,
  request: {
    body: jsonContent(UserQueryWithPrivilegeDelegationDtoSchema, "用户搜索条件"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(
      z.object({
        users: z.array(UserDtoSchema),
        delegations: z.array(PrivilegeDelegationDtoSchema),
      }),
    ), "用户搜索结果"),
  },
});

export const usersSearchDsl = createRoute({
  method: "post",
  path: "/search-dsl",
  tags,
  request: {
    body: jsonContentRequired(
      V3UserProfileSearchTransportRequestSchema,
      "User Profile v3 Filter DSL 搜索条件",
    ),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      z.union([ValidationFailureResponseSchema, StandardErrorResponseSchema]),
      "Filter 校验失败或搜索结果超过固定上限",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      StandardErrorResponseSchema,
      "用户搜索暂时不可用",
    ),
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(UserProfileDetailDocumentSchema)),
      "User Profile v3 Filter DSL 搜索结果",
    ),
  },
});

export const contactRegister = createRoute({
  method: "post",
  path: "/purveyor/contacts",
  tags,
  request: {
    body: jsonContentRequired(z.object({
      username: z.string().openapi({ example: "身份证号" }),
      orgCode: z.string().openapi({ example: "供应商统一社会信用代码" }),
      mobile: z.string().openapi({ example: "12345678" }),
      name: z.string().openapi({ example: "1234" }),
    }), "用户创建参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "联系人注册结果"),
  },
});
