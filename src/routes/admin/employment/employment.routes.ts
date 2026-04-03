import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { EmploymentPaginationQueryDtoSchema } from "@/services/employment/employment.schema";
import { EmploymentVoSchema } from "./employment.schema";

const tags = ["Admin"];

export const employmentsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(EmploymentPaginationQueryDtoSchema, "任职管线查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(EmploymentVoSchema)), "所有符合条件任职列表"),
  },
});
