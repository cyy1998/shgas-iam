import { OrganizationDtoSchema, OrganizationQueryDtoSchema } from "@api/services/organization/organization.schema";
import { UserDetailDtoSchema, UserDtoSchema, UserQueryDtoSchema } from "@api/services/user/user.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";

const routePrefix = "";
const tags = ["Public"];

export const userInfo = createRoute({
  method: "get",
  path: `${routePrefix}/user-info`,
  tags,
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(UserDetailDtoSchema), "本用户基本信息"),
  },
});

export const passwordChange = createRoute({
  method: "post",
  path: `${routePrefix}/password/change`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      oldPassword: z.string().openapi({ example: "1234" }),
      newPassword: z.string().openapi({ example: "1234" }),
    }), "更换密码请求参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "密码更换成功"),
  },
});

export const mobileSet = createRoute({
  method: "post",
  path: `${routePrefix}/mobile/set`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      phoneNumber: z.string().openapi({ example: "17721462865" }),
      code: z.string().openapi({ example: "1234" }),
    }), "移动电话设置请求参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "移动电话设置成功"),
  },
});

export const organizationsSearch = createRoute({
  method: "post",
  path: `${routePrefix}/organizations/search`,
  tags,
  request: {
    body: jsonContentRequired(OrganizationQueryDtoSchema, "组织查询请求参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationDtoSchema)), "组织查询结果"),
  },
});

export const usersSearch = createRoute({
  method: "post",
  path: `${routePrefix}/users/search`,
  tags,
  request: {
    body: jsonContentRequired(UserQueryDtoSchema, "用户查询参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户查询结果"),
  },
});
