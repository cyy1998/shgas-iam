import {
  OrganizationCreateDtoSchema,
  OrganizationDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@api/services/organization/organization.schema";
import { OrganizationSearchTransportRequestSchema } from "@api/services/organization-search/organization-search.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { OrganizationSearchDocumentSchema } from "@iam/organization-search-read-model";

const tags = ["Internal/Organization"];

export const organizationsSearchDsl = createRoute({
  method: "post",
  path: "/search-dsl",
  tags,
  request: { body: jsonContentRequired(OrganizationSearchTransportRequestSchema, "严格组织 Filter DSL") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(OrganizationSearchDocumentSchema.openapi("OrganizationSearchDocument"))),
      "完整组织搜索文档",
    ),
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
    ...commonErrorResponses,
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
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "组织更新成功"),
  },
});

export const purveyorRegister = createRoute({
  method: "post",
  path: "/purveyors",
  tags,
  request: {
    body: jsonContentRequired(
      OrganizationCreateDtoSchema.pick({
        orgCode: true,
        orgName: true,
      }).extend({
        parentOrg: z.enum(["GY", "GT"]).default("GY"),
      }),
      "组织创建参数",
    ),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "供应商注册结果"),
  },
});
