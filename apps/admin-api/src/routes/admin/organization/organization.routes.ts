import {
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationSelectorNodeSchema,
  OrganizationSelectorQueryDtoSchema,
  OrganizationStatusUpdateDtoSchema,
  OrganizationTreeNodeDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@admin-api/services/organization/organization.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@iam/api-core/core/pagination/schema";
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
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(OrganizationVoSchema))),
      "符合条件组织列表",
    ),
  },
});

export const organizationsChildren = createRoute({
  method: "get",
  path: "/children",
  tags,
  request: {
    query: z.object({
      parentOrgCode: z.string().optional().openapi({ example: "SR", description: "父组织编码；留空返回根组织" }),
      pageNum: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(500).default(50),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(OrganizationTreeNodeDtoSchema))),
      "指定父节点的直接子组织（分页）",
    ),
  },
});

export const organizationsSelector = createRoute({
  method: "post",
  path: "/selector",
  tags,
  request: {
    body: jsonContentRequired(OrganizationSelectorQueryDtoSchema, "组织选择器查询参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(OrganizationSelectorNodeSchema)),
      "组织选择器节点",
    ),
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
    ...commonErrorResponses,
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
    ...commonErrorResponses,
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
    ...commonErrorResponses,
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
    ...commonErrorResponses,
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
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "组织删除成功"),
  },
});
