import {
  ClientAdminDetailDtoSchema,
  ClientAdminListDtoSchema,
  ClientCreateDtoSchema,
  ClientDtoSchema,
  ClientInputDtoSchema,
  ClientOidcConfigureDtoSchema,
  ClientOidcMutationResultSchema,
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
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientDtoSchema), "创建客户端成功"),
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
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientDtoSchema), "更新客户端成功"),
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
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
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
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "软删除成功"),
  },
});

export const clientOidcConfigure = createRoute({
  method: "put",
  path: "/:clientCode/oidc/configure",
  tags,
  request: {
    params: z.object({ clientCode: z.string() }),
    body: jsonContentRequired(ClientOidcConfigureDtoSchema, "OIDC 配置"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(ClientOidcMutationResultSchema),
      "OIDC 配置成功",
    ),
  },
});

function createOidcActionRoute(path: string, description: string) {
  return createRoute({
    method: "post",
    path,
    tags,
    request: { params: z.object({ clientCode: z.string() }) },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientOidcMutationResultSchema), description),
    },
  });
}

export const clientOidcEnable = createOidcActionRoute("/:clientCode/oidc/enable", "OIDC 启用成功");
export const clientOidcDisable = createOidcActionRoute("/:clientCode/oidc/disable", "OIDC 禁用成功");
export const clientOidcRemove = createOidcActionRoute("/:clientCode/oidc/remove", "OIDC 配置移除成功");
export const clientOidcRotateSecret = createOidcActionRoute(
  "/:clientCode/oidc/rotate-secret",
  "OIDC secret 轮换成功",
);

export const clientCreateLegacy = createRoute({
  method: "post",
  path: "/create",
  tags,
  request: {
    body: jsonContentRequired(ClientCreateDtoSchema, "客户端创建参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientDtoSchema), "创建客户端成功"),
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
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientDtoSchema), "更新客户端成功"),
  },
});
