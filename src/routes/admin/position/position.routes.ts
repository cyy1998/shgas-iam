import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { PositionPaginationQueryDtoSchema } from "@/services/position/position.schema";
import { PositionVoSchema } from "./position.schema";

const tags = ["Admin"];

export const positionsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(PositionPaginationQueryDtoSchema, "岗位分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(PositionVoSchema)), "符合条件岗位列表"),
  },
});
