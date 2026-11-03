import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import {
  StandardErrorResponseSchema,
  ValidationFailureResponseSchema,
} from "@iam/api-core/core/openapi/schemas/error-response-schema";
import { UserDocumentSchema, UserDocumentSearchResultSchema } from "@iam/contracts";
import { UserNameWriteSchema, UsernameWriteSchema } from "@iam/domain/user";
import { UserDocumentSearchTransportRequestSchema } from "@iam/user-document/document/query";

const tags = ["Internal/User"];
const PublicUserDocumentSchema = z.object(UserDocumentSchema.shape).openapi("UserDocument");

export const userInfo = createRoute({
  method: "get",
  path: "/:username",
  tags,
  request: {
    params: z.object({
      username: z.string().openapi({ example: "123456" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(StandardErrorResponseSchema, "用户详情暂时不可用"),
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(PublicUserDocumentSchema), "已发布用户文档"),
  },
});

export const usersSearchDsl = createRoute({
  method: "post",
  path: "/search-dsl",
  tags,
  request: {
    body: jsonContentRequired(
      UserDocumentSearchTransportRequestSchema,
      "用户筛选、分页、排序及返回字段；paginate 默认 false，开启时 page 默认 1、pageSize 默认 50",
    ),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      z.union([ValidationFailureResponseSchema, StandardErrorResponseSchema]),
      "查询参数非法、超预算或关闭分页时匹配超过 500 项",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(StandardErrorResponseSchema, "用户文档损坏、查询失败或超时"),
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(UserDocumentSearchResultSchema),
      "用户文档搜索结果；分页时本页与精确 total 同快照，非分页时 page/pageSize 为空",
    ),
  },
});

export const contactRegister = createRoute({
  method: "post",
  path: "/purveyor/contacts",
  tags,
  request: {
    body: jsonContentRequired(
      z.object({
        username: UsernameWriteSchema.openapi({ example: "身份证号" }),
        orgCode: z.string().openapi({ example: "供应商统一社会信用代码" }),
        mobile: z.string().openapi({ example: "12345678" }),
        name: UserNameWriteSchema.openapi({ example: "1234" }),
      }),
      "用户创建参数",
    ),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "联系人注册结果"),
  },
});
