import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@lib/core/openapi/schemas/create-success-schema";
import { UserDetailDtoSchema, UserDtoSchema, UserQueryDtoSchema } from "@schemas/user.common.type";
import { OrganizationDtoSchema, OrganizationQueryDtoSchema } from "@/services/organization/organization.schema";

const tags = ["Public"];

export const userInfo = createRoute({
  method: "get",
  path: "/user-info",
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(UserDetailDtoSchema), "本用户基本信息"),
  },
});

export const passwordChange = createRoute({
  method: "post",
  path: "/password/change",
  tags,
  request: {
    body: jsonContentRequired(z.object({
      oldPassword: z.string().openapi({ example: "1234" }),
      newPassword: z.string().openapi({ example: "1234" }),
    }), "更换密码请求参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "密码更换成功"),
  },
});

export const mobileSet = createRoute({
  method: "post",
  path: "/mobile/set",
  tags,
  request: {
    body: jsonContentRequired(z.object({
      phoneNumber: z.string().openapi({ example: "17721462865" }),
      code: z.string().openapi({ example: "1234" }),
    }), "移动电话设置请求参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "移动电话设置成功"),
  },
});

export const organizationsSearch = createRoute({
  method: "post",
  path: "/organizations/search",
  tags,
  request: {
    body: jsonContentRequired(OrganizationQueryDtoSchema, "组织查询请求参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationDtoSchema)), "组织查询结果"),
  },
});

export const usersSearch = createRoute({
  method: "post",
  path: "/users/search",
  tags,
  request: {
    body: jsonContentRequired(UserQueryDtoSchema, "用户查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户查询结果"),
  },
});

export const usersQueryByOrg = createRoute({
  method: "get",
  path: "/users/by-org",
  tags,
  request: {
    query: z.object({
      orgCode: z.string().openapi({ example: "123" }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户查询结果"),
  },
});
