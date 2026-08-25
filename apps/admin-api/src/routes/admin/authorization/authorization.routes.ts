import { createRoute } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { AdminCapabilitySummarySchema } from "@iam/contracts";

export const capabilitySummary = createRoute({
  method: "get",
  path: "/capabilities",
  tags: ["Admin/Authorization"],
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(AdminCapabilitySummarySchema),
      "当前管理员能力摘要",
    ),
  },
});
