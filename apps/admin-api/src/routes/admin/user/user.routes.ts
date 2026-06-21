import { UserDetailVoSchema, UserVoSchema } from "@admin-api/routes/admin/user/user.schema";
import {
  UserAdminCreateDtoSchema,
  UserPaginationQueryDtoSchema,
  UserStatusUpdateDtoSchema,
  UserUpdateDtoSchema,
} from "@admin-api/services/user/user.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@iam/api-core/core/pagination/schema";

const tags = ["Admin/User"];

export const usersSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(UserPaginationQueryDtoSchema, "用户分页查询参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(UserVoSchema))),
      "分页用户列表",
    ),
  },
});

export const usersDetail = createRoute({
  method: "get",
  path: "/:username",
  tags,
  request: {
    params: z.object({ username: z.string().openapi({ example: "138550" }) }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(UserDetailVoSchema),
      "用户详情（含雇佣/角色/权限聚合）",
    ),
  },
});

export const usersCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(UserAdminCreateDtoSchema, "创建用户参数（密码可留空由后端生成）"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.object({
        username: z.string(),
        generatedPassword: z.string().nullable().openapi({
          description: "若请求未提供 password，则返回后端生成的明文密码；否则为 null",
        }),
      })),
      "用户创建成功",
    ),
  },
});

export const usersUpdate = createRoute({
  method: "put",
  path: "/:username",
  tags,
  request: {
    params: z.object({ username: z.string() }),
    body: jsonContentRequired(UserUpdateDtoSchema, "用户更新参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "更新成功"),
  },
});

export const usersStatusUpdate = createRoute({
  method: "patch",
  path: "/:username/status",
  tags,
  request: {
    params: z.object({ username: z.string() }),
    body: jsonContentRequired(UserStatusUpdateDtoSchema, "用户状态变更"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
  },
});

export const usersDelete = createRoute({
  method: "delete",
  path: "/:username",
  tags,
  request: {
    params: z.object({ username: z.string() }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "软删除成功"),
  },
});

export const usersResetPassword = createRoute({
  method: "post",
  path: "/:username/reset-password",
  tags,
  request: {
    params: z.object({ username: z.string() }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.string().openapi({ example: "Z8m2xq7W", description: "新的明文密码" })),
      "密码已重置",
    ),
  },
});

export const usersGeneratePassword = createRoute({
  method: "post",
  path: "/generate-password",
  tags,
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.string()), "候选密码"),
  },
});
