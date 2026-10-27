import {
  OrganizationCreateDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@api/services/organization/organization.schema";
import { OrganizationDocumentTransportRequestSchema } from "@api/services/organization-document/organization-document.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { OrganizationDocumentSchema } from "@iam/organization-document";

const tags = ["Internal/Organization"];
// Add transport metadata without depending on when the shared Zod schema was created.
const OrganizationDocumentResponseSchema = z.object(OrganizationDocumentSchema.shape).openapi("OrganizationDocument");

export const organizationsSearchDsl = createRoute({
  method: "post",
  path: "/search-dsl",
  tags,
  request: { body: jsonContentRequired(OrganizationDocumentTransportRequestSchema, "严格组织 Filter DSL") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(OrganizationDocumentResponseSchema)),
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
