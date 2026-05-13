import { OrganizationDtoSchema, OrganizationQueryDtoSchema, OrganizationUpdateDtoSchema } from "@api/services/organization/organization.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";

const tags = ["Internal/Organization"];

export const organizationsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(OrganizationQueryDtoSchema, "组织搜索参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationDtoSchema)), "组织搜索结果"),
  },
});

export const organizationGetByCode = createRoute({
  method: "get",
  path: "/:orgCode",
  tags,
  request: {
    params: z.object({
      orgCode: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(OrganizationDtoSchema), "组织查询结果"),
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

export const purveyorRegister = createRoute({
  method: "post",
  path: "/purveyors",
  tags,
  request: {
    body: jsonContentRequired(z.object({
      orgCode: z.string().openapi({ example: "统一社会信用代码" }),
      orgName: z.string().openapi({ example: "供应商A" }),
      parentOrg: z.enum(["GY", "GT"]).default("GY"),
    }), "组织创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "供应商注册结果"),
  },
});
