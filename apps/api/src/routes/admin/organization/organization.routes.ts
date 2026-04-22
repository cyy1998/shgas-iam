import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import {
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationStatusUpdateDtoSchema,
  OrganizationTreeNodeDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@/services/organization/organization.schema";
import { OrganizationDetailVoSchema, OrganizationVoSchema } from "./organization.schema";

const tags = ["Admin/Organization"];

export const organizationsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(OrganizationPaginationQueryDtoSchema, "组织分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationVoSchema)), "符合条件组织列表"),
  },
});

export const organizationsTree = createRoute({
  method: "get",
  path: "/tree",
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationTreeNodeDtoSchema)), "完整组织树"),
  },
});

export const organizationDetail = createRoute({
  method: "get",
  path: "/:orgCode",
  tags,
  request: {
    params: z.object({ orgCode: z.string().openapi({ example: "SR" }) }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(OrganizationDetailVoSchema), "组织详情"),
  },
});

export const organizationCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(OrganizationCreateDtoSchema, "组织创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "组织创建成功"),
  },
});

export const organizationUpdate = createRoute({
  method: "put",
  path: "/:orgCode",
  tags,
  request: {
    params: z.object({ orgCode: z.string() }),
    body: jsonContentRequired(OrganizationUpdateDtoSchema, "组织更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "组织更新成功"),
  },
});

export const organizationStatusUpdate = createRoute({
  method: "patch",
  path: "/:orgCode/status",
  tags,
  request: {
    params: z.object({ orgCode: z.string() }),
    body: jsonContentRequired(OrganizationStatusUpdateDtoSchema, "组织状态变更"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
  },
});

export const organizationDelete = createRoute({
  method: "delete",
  path: "/:orgCode",
  tags,
  request: {
    params: z.object({ orgCode: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "组织删除成功"),
  },
});
