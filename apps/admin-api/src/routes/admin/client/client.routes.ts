import { ClientCreateDtoSchema, ClientDtoSchema, ClientInputDtoSchema } from "@admin-api/services/client/client.schema";
import { createRoute } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";

const routePrefix = "";
const tags = ["Admin/Client"];

export const clientUpdate = createRoute({
  method: "post",
  path: `${routePrefix}/update`,
  tags,
  request: {
    body: jsonContentRequired(ClientInputDtoSchema, "客户端更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientDtoSchema), "更新客户端成功"),
  },
});

export const clientCreate = createRoute({
  method: "post",
  path: `${routePrefix}/create`,
  tags,
  request: {
    body: jsonContentRequired(ClientCreateDtoSchema, "客户端创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientDtoSchema), "创建客户端成功"),
  },
});
