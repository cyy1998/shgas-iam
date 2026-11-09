import {
  OrganizationCreateDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@api/services/organization/organization.schema";
import { OrganizationDocumentTransportRequestSchema } from "@api/services/organization-document/organization-document.schema";
import { createRoute, z } from "@hono/zod-openapi";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import {
  StandardErrorResponseSchema,
  ValidationFailureResponseSchema,
} from "@iam/api-core/core/openapi/schemas/error-response-schema";
import { OrganizationDocumentSearchResultSchema } from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";
import { OrganizationDocumentSchema } from "@iam/organization-document";

const tags = ["Internal/Organization"];
// Add transport metadata without depending on when the shared Zod schema was created.
const OrganizationDocumentResponseSchema = z.object(OrganizationDocumentSchema.shape).openapi("OrganizationDocument");

export const organizationsSearchDsl = createRoute({
  method: "post",
  path: "/search-dsl",
  tags,
  request: { body: jsonContentRequired(OrganizationDocumentTransportRequestSchema, "组织筛选、分页、排序及返回字段") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      z.union([ValidationFailureResponseSchema, StandardErrorResponseSchema]),
      "查询参数非法、超预算或非分页匹配超过 500 项",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(StandardErrorResponseSchema, "组织文档损坏、查询失败或超时"),
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(OrganizationDocumentSearchResultSchema),
      "组织文档搜索结果和精确总数；非分页时 page/pageSize 为 null",
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
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(OrganizationDocumentResponseSchema),
      "已发布组织目录文档",
    ),
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
