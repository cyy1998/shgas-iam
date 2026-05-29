import { AuditLogDtoSchema, AuditLogPaginationQueryDtoSchema } from "@admin-api/services/audit/audit.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@iam/api-core/core/pagination/schema";

const tags = ["Admin/Audit"];

export const auditLogsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(AuditLogPaginationQueryDtoSchema, "审计日志分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(AuditLogDtoSchema))),
      "分页审计日志列表",
    ),
  },
});
