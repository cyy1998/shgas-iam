import {
  RoleAssignmentCreateDtoSchema,
  RoleAssignmentPaginationQueryDtoSchema,
  RoleAssignmentScopeUpdateDtoSchema,
  RoleCreateDtoSchema,
  RolePaginationQueryDtoSchema,
  RoleStatusUpdateDtoSchema,
  RoleUpdateDtoSchema,
} from "@admin-api/services/role/role.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@iam/api-core/core/pagination/schema";
import { RoleAssignmentVoSchema, RoleDetailVoSchema, RoleVoSchema } from "./role.schema";

const tags = ["Admin/Role"];
const roleCodeParam = z.object({ roleCode: z.string().openapi({ example: "portal-admin" }) });
const assignmentParam = roleCodeParam.extend({
  assignmentId: z.coerce.number().int().positive().openapi({ example: 1001 }),
});

export const rolesSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(RolePaginationQueryDtoSchema, "角色分页查询参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(RoleVoSchema))),
      "分页角色列表",
    ),
  },
});

export const roleDetail = createRoute({
  method: "get",
  path: "/:roleCode",
  tags,
  request: { params: roleCodeParam },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(RoleDetailVoSchema), "角色详情"),
  },
});

export const roleCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(RoleCreateDtoSchema, "角色创建参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(RoleDetailVoSchema), "角色创建成功"),
  },
});

export const roleUpdate = createRoute({
  method: "put",
  path: "/:roleCode",
  tags,
  request: {
    params: roleCodeParam,
    body: jsonContentRequired(RoleUpdateDtoSchema, "角色更新参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(RoleDetailVoSchema), "角色更新成功"),
  },
});

export const roleStatusUpdate = createRoute({
  method: "patch",
  path: "/:roleCode/status",
  tags,
  request: {
    params: roleCodeParam,
    body: jsonContentRequired(RoleStatusUpdateDtoSchema, "角色状态变更"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(RoleDetailVoSchema), "角色状态更新成功"),
  },
});

export const roleDelete = createRoute({
  method: "delete",
  path: "/:roleCode",
  tags,
  request: { params: roleCodeParam },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "角色删除成功"),
  },
});

export const roleAssignmentsSearch = createRoute({
  method: "post",
  path: "/:roleCode/assignments/search",
  tags,
  request: {
    params: roleCodeParam,
    body: jsonContentRequired(RoleAssignmentPaginationQueryDtoSchema, "角色分配分页查询参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(RoleAssignmentVoSchema))),
      "分页角色分配列表",
    ),
  },
});

export const roleAssignmentCreate = createRoute({
  method: "post",
  path: "/:roleCode/assignments",
  tags,
  request: {
    params: roleCodeParam,
    body: jsonContentRequired(RoleAssignmentCreateDtoSchema, "角色分配创建参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(RoleAssignmentVoSchema), "角色分配创建成功"),
  },
});

export const roleAssignmentScopeUpdate = createRoute({
  method: "patch",
  path: "/:roleCode/assignments/:assignmentId/scope",
  tags,
  request: {
    params: assignmentParam,
    body: jsonContentRequired(RoleAssignmentScopeUpdateDtoSchema, "角色分配组织作用范围更新参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(RoleAssignmentVoSchema), "角色分配作用范围更新成功"),
  },
});

export const roleAssignmentDelete = createRoute({
  method: "delete",
  path: "/:roleCode/assignments/:assignmentId",
  tags,
  request: { params: assignmentParam },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "角色分配删除成功"),
  },
});
