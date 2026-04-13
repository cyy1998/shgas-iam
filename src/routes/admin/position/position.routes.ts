import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { PositionCreateDtoSchema, PositionPaginationQueryDtoSchema } from "@/services/position/position.schema";
import { PositionVoSchema } from "./position.schema";

export const routePrefix = "/admin/positions";
const tags = ["Admin/Position"];

export const positionsSearch = createRoute({
  method: "post",
  path: `${routePrefix}/search`,
  tags,
  request: {
    body: jsonContentRequired(PositionPaginationQueryDtoSchema, "岗位分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(PositionVoSchema)), "符合条件岗位列表"),
  },
});

export const positionsSet = createRoute({
  method: "post",
  path: `${routePrefix}/set`,
  tags,
  request: {
    body: jsonContentRequired(z.object({ data: z.array(PositionCreateDtoSchema) }), "岗位创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "岗位设置成功"),
  },
});
