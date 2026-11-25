import { DocumentPaginationSchema, organizationDocumentSelection, organizationDocumentSorting } from "@iam/contracts";
import { createFilterTransportSchemas } from "@iam/filter-engine";

const transportSchemas = createFilterTransportSchemas({
  annotateExpression: (schema) =>
    schema.openapi("OrganizationFilterExpression", {
      description: "通用递归 Filter AST；字段、操作符和 value 类型由 Search Document 公开结构严格裁决。",
    }),
});
export const OrganizationFilterTransportSchema = transportSchemas.expressionSchema;

export const OrganizationDocumentTransportRequestSchema = DocumentPaginationSchema.safeExtend({
  filter: transportSchemas.budgetedSchema.optional(),
  select: organizationDocumentSelection.selectSchema.optional(),
  sort: organizationDocumentSorting.sortSchema.optional(),
})
  .strict()
  .openapi("OrganizationDocumentRequest");
