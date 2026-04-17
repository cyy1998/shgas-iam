import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { OrganizationCreateDtoSchema, OrganizationDtoSchema, OrganizationQueryDtoSchema } from "@/services/organization/organization.schema";

export const routePrefix = "/admin/organizations";
const tags = ["Admin/Organization"];

export const organizationsSearch = createRoute({
  method: "post",
  path: `${routePrefix}/search`,
  tags,
  request: {
    body: jsonContentRequired(OrganizationQueryDtoSchema, "组织查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationDtoSchema)), "所有符合条件组织列表"),
  },
});

export const organizationsSet = createRoute({
  method: "post",
  path: `${routePrefix}/set`,
  tags,
  request: {
    body: jsonContentRequired(OrganizationCreateDtoSchema, "组织创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "设置组织成功"),
  },
});
