import { createRoute } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { ClientDtoSchema, ClientInputDtoSchema } from "@/services/client/client.schema";

const tags = ["Admin"];

export const clientUpdate = createRoute({
  method: "post",
  path: "/update",
  tags,
  request: {
    body: jsonContentRequired(ClientInputDtoSchema, "客户端更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientDtoSchema), "更新客户端成功"),
  },
});
