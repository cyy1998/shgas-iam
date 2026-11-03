import { DocumentPaginationSchema, organizationDocumentSelection, organizationDocumentSorting } from "@iam/contracts";
import { createFilterEngine, type FilterForShape } from "@iam/filter-engine";
import { ORGANIZATION_DOCUMENT_STRUCTURE } from "../schema";

export type OrganizationDocumentFilter = FilterForShape<typeof ORGANIZATION_DOCUMENT_STRUCTURE.fields>;
export const organizationDocumentFilterEngine = createFilterEngine(ORGANIZATION_DOCUMENT_STRUCTURE);
export const OrganizationDocumentRequestSchema = DocumentPaginationSchema.safeExtend({
  filter: organizationDocumentFilterEngine.filterSchema.optional(),
  select: organizationDocumentSelection.selectSchema.optional(),
  sort: organizationDocumentSorting.sortSchema.optional(),
}).strict();
