import { createFilterEngine, type FilterForShape } from "@iam/filter-engine";
import { z } from "zod";
import { ORGANIZATION_DOCUMENT_STRUCTURE } from "../schema";

export type OrganizationDocumentFilter = FilterForShape<typeof ORGANIZATION_DOCUMENT_STRUCTURE.fields>;
export const organizationDocumentFilterEngine = createFilterEngine(ORGANIZATION_DOCUMENT_STRUCTURE);
export const OrganizationDocumentRequestSchema = z
  .object({ filter: organizationDocumentFilterEngine.filterSchema })
  .strict();
