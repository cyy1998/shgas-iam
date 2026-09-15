import {
  ClientAdminDetailDtoSchema,
  ClientAdminListDtoSchema,
  ClientCreateDtoSchema,
  ClientInputDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientStatusUpdateDtoSchema,
  ClientUpdateDtoSchema,
} from "@admin-api/services/client/client.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@iam/api-core/core/pagination/schema";
import { createAdminMutationResultSchema } from "@iam/contracts";

const tags = ["Admin/Client"];

export const clientsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(ClientPaginationQueryDtoSchema, "客户端分页查询参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(ClientAdminListDtoSchema))),
      "分页客户端列表",
    ),
  },
});

export const clientCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(ClientCreateDtoSchema, "客户端创建参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createAdminMutationResultSchema(ClientAdminDetailDtoSchema)), "创建客户端成功"),
  },
});

export const clientDetail = createRoute({
  method: "get",
  path: "/:clientCode",
  tags,
  request: {
    params: z.object({ clientCode: z.string().openapi({ example: "portal" }) }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientAdminDetailDtoSchema), "客户端详情"),
  },
});

export const clientUpdate = createRoute({
  method: "put",
  path: "/:clientCode",
  tags,
  request: {
    params: z.object({ clientCode: z.string() }),
    body: jsonContentRequired(ClientUpdateDtoSchema, "客户端更新参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createAdminMutationResultSchema(z.null())), "更新客户端成功"),
  },
});

export const clientStatusUpdate = createRoute({
  method: "patch",
  path: "/:clientCode/status",
  tags,
  request: {
    params: z.object({ clientCode: z.string() }),
    body: jsonContentRequired(ClientStatusUpdateDtoSchema, "客户端状态变更"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createAdminMutationResultSchema(z.null())), "状态更新成功"),
  },
});

export const clientDelete = createRoute({
  method: "delete",
  path: "/:clientCode",
  tags,
  request: {
    params: z.object({ clientCode: z.string() }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createAdminMutationResultSchema(z.null())), "软删除成功"),
  },
});

export const clientCreateLegacy = createRoute({
  method: "post",
  path: "/create",
  tags,
  request: {
    body: jsonContentRequired(ClientCreateDtoSchema, "客户端创建参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createAdminMutationResultSchema(ClientAdminDetailDtoSchema)), "创建客户端成功"),
  },
});

export const clientUpdateLegacy = createRoute({
  method: "post",
  path: "/update",
  tags,
  request: {
    body: jsonContentRequired(ClientInputDtoSchema, "客户端更新参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createAdminMutationResultSchema(z.null())), "更新客户端成功"),
  },
});
