import { z } from "@hono/zod-openapi";
import { createFilterTransportSchemas } from "@iam/filter-engine";

const transportSchemas = createFilterTransportSchemas({
  annotateExpression: (schema) =>
    schema.openapi("OrganizationFilterExpression", {
      description: "通用递归 Filter AST；字段、操作符和 value 类型由 Search Document 公开结构严格裁决。",
    }),
});
export const OrganizationFilterTransportSchema = transportSchemas.expressionSchema;

export const OrganizationSearchTransportRequestSchema = z
  .object({
    filter: transportSchemas.budgetedSchema,
  })
  .strict()
  .openapi("OrganizationSearchRequest");
