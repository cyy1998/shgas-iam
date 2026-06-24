import { PrivilegeDelegationDtoSchema } from "@api/services/privilege/privilegeDelegation.schema";
import { UserDetailDtoSchema, UserDtoSchema, UserQueryDtoSchema, UserQueryWithPrivilegeDelegationDtoSchema } from "@api/services/user/user.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";

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
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(UserDetailDtoSchema), "用户详细信息"),
  },
});

export const usersSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
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
