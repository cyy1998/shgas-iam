import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@/lib/core/pagination/schema";
import { UserDetailVoSchema, UserVoSchema } from "@/routes/admin/user/user.schema";
import { UserCreateDtoSchema, UserPaginationQueryDtoSchema } from "@/services/user/user.schema";

const routePrefix = "/admin/users";
const tags = ["Admin/User"];

export const usersSearch = createRoute({
  method: "post",
  path: `${routePrefix}/search`,
  tags,
  request: {
    body: jsonContentRequired(UserPaginationQueryDtoSchema, "管理员用户查询"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createPageResultSchema(UserVoSchema)), "搜索结果"),
  },
});

export const usersDetail = createRoute({
  method: "get",
  path: `${routePrefix}/detail`,
  tags,
  request: {
    query: z.object({
      username: z.string().openapi({ example: "123456" }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(UserDetailVoSchema), "用户详情"),
  },
});

export const passwordReset = createRoute({
  method: "post",
  path: `${routePrefix}/reset-password`,
  tags,
  request: {
    body: jsonContentRequired(z.object({ username: z.string().openapi({ example: "138550" }) }), "用户名"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.string()), "用户新密码"),
  },
});

export const passwordGenerate = createRoute({
  method: "post",
  path: `${routePrefix}/generate-password`,
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.string()), "用户新密码"),
  },
});

export const usersSet = createRoute({
  method: "post",
  path: `${routePrefix}/set`,
  tags,
  request: {
    body: jsonContentRequired(z.object({ data: z.array(UserCreateDtoSchema) }), "用户创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "创建结果"),
  },
});
