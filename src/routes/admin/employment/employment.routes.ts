import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { EmploymentCreateDtoSchema, EmploymentPaginationQueryDtoSchema } from "@/services/employment/employment.schema";
import { EmploymentVoSchema } from "./employment.schema";

const routePrefix = "/admin/employments";
const tags = ["Admin/Employment"];

export const employmentsSearch = createRoute({
  method: "post",
  path: `${routePrefix}/search`,
  tags,
  request: {
    body: jsonContentRequired(EmploymentPaginationQueryDtoSchema, "任职关系查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(EmploymentVoSchema)), "所有符合条件任职列表"),
  },
});

export const employmentsSet = createRoute({
  method: "post",
  path: `${routePrefix}/set`,
  tags,
  request: {
    body: jsonContentRequired(EmploymentCreateDtoSchema, "任职关系创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "设置任职关系成功"),
  },
});
